import { z } from "zod";
import type { RunContext } from "../context.js";
import type { SubgraphVote } from "../subgraph/types.js";

export const getProposalVotesSchema = z.object({
  proposalId: z
    .union([z.string(), z.number()])
    .describe("Proposal ID (hex string) or proposal number"),
  support: z
    .enum(["FOR", "AGAINST", "ABSTAIN"])
    .optional()
    .describe("Filter by vote type"),
  limit: z.number().min(1).max(200).default(50).describe("Number of votes to return"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
  format: z
    .enum(["json", "toon"])
    .default("json")
    .describe("Output format: 'json' (default) or 'toon' for ~40% token savings"),
});

export type GetProposalVotesInput = z.infer<typeof getProposalVotesSchema>;

export interface GetProposalVotesOutput {
  votes: Array<{
    voter: string;
    support: "FOR" | "AGAINST" | "ABSTAIN";
    weight: string;
    reason: string | null;
    timestamp: number;
    transactionHash: string | null;
  }>;
  summary: {
    totalVoters: number;
    forVoters: number;
    againstVoters: number;
    abstainVoters: number;
  };
  /** Votes matching the request (after the support filter), across all pages */
  total: number;
  hasMore: boolean;
}

// Subgraph page size for the fetch-all pass, with a cap so a misbehaving
// endpoint cannot loop forever.
const FETCH_PAGE_SIZE = 500;
const MAX_FETCHED_VOTES = 5000;

async function fetchAllVotes(ctx: RunContext, proposalNumber: number): Promise<SubgraphVote[]> {
  const all: SubgraphVote[] = [];
  while (all.length < MAX_FETCHED_VOTES) {
    const page = await ctx.subgraph.fetchVotes(proposalNumber, FETCH_PAGE_SIZE, all.length);
    all.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
  }
  return all;
}


export async function getProposalVotes(
  input: GetProposalVotesInput,
  ctx: RunContext
): Promise<GetProposalVotesOutput | null> {
  // Resolve proposal number
  let proposalNumber: number;

  if (typeof input.proposalId === "number") {
    proposalNumber = input.proposalId;
  } else if (input.proposalId.startsWith("0x")) {
    // Fetch proposal by ID to get number
    const proposal = await ctx.subgraph.fetchProposalById(input.proposalId);
    if (!proposal) return null;
    proposalNumber = proposal.proposalNumber;
  } else {
    const num = parseInt(input.proposalId, 10);
    if (isNaN(num)) return null;
    proposalNumber = num;
  }

  // Fetch every vote: the subgraph cannot filter by support (done client-side) and
  // the summary/total must describe the whole proposal, not the requested page.
  const votes = await fetchAllVotes(ctx, proposalNumber);

  // Process votes
  let processedVotes = votes.map((v) => ({
    voter: v.voter,
    support: v.support,
    weight: v.weight,
    reason: v.reason,
    timestamp: parseInt(v.timestamp, 10),
    transactionHash: v.transactionHash,
  }));

  // Calculate summary from all votes
  const summary = {
    totalVoters: processedVotes.length,
    forVoters: processedVotes.filter((v) => v.support === "FOR").length,
    againstVoters: processedVotes.filter((v) => v.support === "AGAINST").length,
    abstainVoters: processedVotes.filter((v) => v.support === "ABSTAIN").length,
  };

  // Apply support filter if specified
  if (input.support) {
    processedVotes = processedVotes.filter((v) => v.support === input.support);
  }

  // Get total before pagination
  const total = processedVotes.length;

  const page = processedVotes.slice(input.offset, input.offset + input.limit);

  return {
    votes: page,
    summary,
    total,
    hasMore: input.offset + page.length < total,
  };
}
