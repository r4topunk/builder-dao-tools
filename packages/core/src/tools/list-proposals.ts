import { z } from "zod";
import type { RunContext } from "../context.js";
import type { SubgraphProposal } from "../subgraph/types.js";
import { calculateProposalStatus } from "../subgraph/types.js";

export const listProposalsSchema = z.object({
  status: z
    .enum([
      "PENDING",
      "ACTIVE",
      "CANCELLED",
      "DEFEATED",
      "SUCCEEDED",
      "QUEUED",
      "EXPIRED",
      "EXECUTED",
      "VETOED",
    ])
    .optional()
    .describe("Filter by proposal status"),
  limit: z.number().min(1).max(100).default(20).describe("Number of proposals to return"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
  order: z.enum(["asc", "desc"]).default("desc").describe("Sort order by creation time"),
  format: z
    .enum(["json", "toon"])
    .default("json")
    .describe("Output format: 'json' (default) or 'toon' for ~40% token savings"),
});

export type ListProposalsInput = z.infer<typeof listProposalsSchema>;

export interface ListProposalsOutput {
  proposals: Array<{
    proposalNumber: number;
    title: string;
    status: string;
    proposer: string;
    forVotes: number;
    againstVotes: number;
    abstainVotes: number;
    quorumVotes: number;
    voteStart: string;
    voteEnd: string;
    timeCreated: number;
  }>;
  total: number;
  hasMore: boolean;
}

// Subgraph page size for the fetch-all pass. The cap matches graph-node's `skip`
// ceiling and keeps a misbehaving endpoint from looping forever.
const FETCH_PAGE_SIZE = 200;
const MAX_FETCHED_PROPOSALS = 5000;

async function fetchAllProposals(ctx: RunContext): Promise<SubgraphProposal[]> {
  const all: SubgraphProposal[] = [];
  while (all.length < MAX_FETCHED_PROPOSALS) {
    const page = await ctx.subgraph.fetchProposals(FETCH_PAGE_SIZE, all.length);
    all.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
  }
  return all;
}

export async function listProposals(input: ListProposalsInput, ctx: RunContext): Promise<ListProposalsOutput> {
  // The subgraph can neither filter by status (it is derived client-side) nor be
  // trusted for a total count, so fetch the full set and paginate in memory —
  // that keeps `total`, `hasMore` and the ordering globally correct across pages.
  const proposals = await fetchAllProposals(ctx);

  // Calculate status for each proposal and optionally filter
  let processedProposals = proposals.map((p) => ({
    proposalNumber: p.proposalNumber,
    title: p.title || "",
    status: calculateProposalStatus(p),
    proposer: p.proposer,
    forVotes: parseInt(p.forVotes, 10),
    againstVotes: parseInt(p.againstVotes, 10),
    abstainVotes: parseInt(p.abstainVotes, 10),
    quorumVotes: parseInt(p.quorumVotes, 10),
    voteStart: p.voteStart,
    voteEnd: p.voteEnd,
    timeCreated: parseInt(p.timeCreated, 10),
  }));

  // Apply status filter if specified
  if (input.status) {
    processedProposals = processedProposals.filter((p) => p.status === input.status);
  }

  // Order the full set (proposalNumber breaks ties on identical timestamps)
  const direction = input.order === "asc" ? 1 : -1;
  processedProposals.sort(
    (a, b) =>
      direction * (a.timeCreated - b.timeCreated || a.proposalNumber - b.proposalNumber)
  );

  // Total over the full (optionally filtered) set, before pagination
  const total = processedProposals.length;

  const page = processedProposals.slice(input.offset, input.offset + input.limit);

  return {
    proposals: page,
    total,
    hasMore: input.offset + page.length < total,
  };
}
