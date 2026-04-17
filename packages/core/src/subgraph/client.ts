import type { DaoConfig } from "../config.js";
import { getSubgraphUrl } from "../config.js";
import {
  PROPOSALS_QUERY,
  PROPOSAL_BY_NUMBER_QUERY,
  PROPOSAL_BY_ID_QUERY,
  VOTES_QUERY,
  RECENT_PROPOSALS_QUERY,
} from "./queries.js";
import type {
  SubgraphProposal,
  SubgraphVote,
  ProposalsQueryResponse,
  VotesQueryResponse,
} from "./types.js";

export class SubgraphError extends Error {
  constructor(
    message: string,
    public readonly query: string,
    public readonly variables?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SubgraphError";
  }
}

export interface SubgraphClient {
  fetchProposals(first?: number, skip?: number): Promise<SubgraphProposal[]>;
  fetchProposalByNumber(n: number): Promise<SubgraphProposal | null>;
  fetchProposalById(id: string): Promise<SubgraphProposal | null>;
  fetchVotes(n: number, first?: number, skip?: number): Promise<SubgraphVote[]>;
  fetchRecentProposals(sinceTimestamp: number): Promise<SubgraphProposal[]>;
}

export function createSubgraphClient(cfg: DaoConfig): SubgraphClient {
  const url = getSubgraphUrl(cfg);
  const daoAddress = cfg.daoAddress.toLowerCase();

  async function execute<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new SubgraphError(
        `Subgraph request failed: ${response.status} ${response.statusText}`,
        query,
        variables
      );
    }
    const result = (await response.json()) as T & { errors?: Array<{ message: string }> };
    if ("errors" in result && result.errors && result.errors.length > 0) {
      throw new SubgraphError(
        `Subgraph query error: ${result.errors.map((e) => e.message).join(", ")}`,
        query,
        variables
      );
    }
    return result;
  }

  return {
    async fetchProposals(first = 20, skip = 0) {
      const r = await execute<ProposalsQueryResponse>(PROPOSALS_QUERY, { daoAddress, first, skip });
      return r.data.proposals;
    },
    async fetchProposalByNumber(proposalNumber) {
      const r = await execute<ProposalsQueryResponse>(PROPOSAL_BY_NUMBER_QUERY, {
        daoAddress,
        proposalNumber,
      });
      return r.data.proposals[0] ?? null;
    },
    async fetchProposalById(proposalId) {
      const r = await execute<ProposalsQueryResponse>(PROPOSAL_BY_ID_QUERY, {
        proposalId: proposalId.toLowerCase(),
      });
      return r.data.proposals[0] ?? null;
    },
    async fetchVotes(proposalNumber, first = 50, skip = 0) {
      const r = await execute<VotesQueryResponse>(VOTES_QUERY, {
        daoAddress,
        proposalNumber,
        first,
        skip,
      });
      return r.data.proposalVotes;
    },
    async fetchRecentProposals(sinceTimestamp) {
      const r = await execute<ProposalsQueryResponse>(RECENT_PROPOSALS_QUERY, {
        daoAddress,
        since: sinceTimestamp.toString(),
      });
      return r.data.proposals;
    },
  };
}
