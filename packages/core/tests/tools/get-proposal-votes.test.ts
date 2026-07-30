import { describe, it, expect, vi } from "vitest";
import { getProposalVotes } from "../../src/tools/get-proposal-votes.js";
import { makeContextWithSubgraph } from "../fixtures/context.js";
import { mockProposal, mockVotes } from "../fixtures/proposals.js";
import type { SubgraphVote } from "../../src/subgraph/types.js";

const SUPPORTS = ["FOR", "AGAINST", "ABSTAIN"] as const;

/** n votes, cycling FOR/AGAINST/ABSTAIN so the summary is predictable. */
function makeVotes(n: number): SubgraphVote[] {
  return Array.from({ length: n }, (_, i) => ({
    ...mockVotes[0]!,
    id: `0x1234-vote-${i}`,
    voter: `0x${(i + 1).toString(16).padStart(40, "0")}`,
    support: SUPPORTS[i % 3]!,
    timestamp: String(1700100000 + i),
  }));
}

describe("getProposalVotes", () => {
  it("should return votes for a proposal", async () => {
    const ctx = makeContextWithSubgraph({
      fetchVotes: async (n) => (n === 42 ? mockVotes : []),
    });

    const result = await getProposalVotes({ proposalId: 42, limit: 50, offset: 0, format: "json" }, ctx);

    expect(result).not.toBeNull();
    expect(result?.votes).toHaveLength(4);
  });

  it("should filter by support type", async () => {
    const ctx = makeContextWithSubgraph({
      fetchVotes: async (n) => (n === 42 ? mockVotes : []),
    });

    const forVotes = await getProposalVotes({ proposalId: 42, support: "FOR", limit: 50, offset: 0, format: "json" }, ctx);
    const againstVotes = await getProposalVotes({ proposalId: 42, support: "AGAINST", limit: 50, offset: 0, format: "json" }, ctx);
    const abstainVotes = await getProposalVotes({ proposalId: 42, support: "ABSTAIN", limit: 50, offset: 0, format: "json" }, ctx);

    expect(forVotes?.votes).toHaveLength(2);
    expect(againstVotes?.votes).toHaveLength(1);
    expect(abstainVotes?.votes).toHaveLength(1);
  });

  it("should include vote summary", async () => {
    const ctx = makeContextWithSubgraph({
      fetchVotes: async (n) => (n === 42 ? mockVotes : []),
    });

    const result = await getProposalVotes({ proposalId: 42, limit: 50, offset: 0, format: "json" }, ctx);

    expect(result?.summary.totalVoters).toBe(4);
    expect(result?.summary.forVoters).toBe(2);
    expect(result?.summary.againstVoters).toBe(1);
    expect(result?.summary.abstainVoters).toBe(1);
  });

  it("should paginate votes", async () => {
    // The new implementation applies client-side pagination only when support filter is set.
    // Use support filter to exercise the pagination/hasMore path with 2 FOR votes.
    const ctx = makeContextWithSubgraph({
      fetchVotes: async (n) => (n === 42 ? mockVotes : []),
    });

    // 2 FOR votes total; page1 limit=1 → hasMore=true, page2 offset=1 → hasMore=false
    const page1 = await getProposalVotes({ proposalId: 42, support: "FOR", limit: 1, offset: 0, format: "json" }, ctx);
    const page2 = await getProposalVotes({ proposalId: 42, support: "FOR", limit: 1, offset: 1, format: "json" }, ctx);

    expect(page1?.votes).toHaveLength(1);
    expect(page1?.hasMore).toBe(true);

    expect(page2?.votes).toHaveLength(1);
    expect(page2?.hasMore).toBe(false);
  });

  it("should compute summary, total and hasMore over the full set, not the page", async () => {
    const votes = makeVotes(600);
    const fetchVotes = vi.fn(async (n: number, first = 50, skip = 0) =>
      n === 42 ? votes.slice(skip, skip + first) : []
    );
    const ctx = makeContextWithSubgraph({ fetchVotes });

    const page1 = await getProposalVotes(
      { proposalId: 42, limit: 50, offset: 0, format: "json" },
      ctx
    );

    expect(page1?.votes).toHaveLength(50);
    expect(page1?.total).toBe(600);
    expect(page1?.hasMore).toBe(true);
    expect(page1?.summary.totalVoters).toBe(600);
    expect(page1?.summary.forVoters).toBe(200);
    expect(page1?.summary.againstVoters).toBe(200);
    expect(page1?.summary.abstainVoters).toBe(200);
    // 500 + 100 → two subgraph round trips
    expect(fetchVotes).toHaveBeenCalledTimes(2);
    expect(fetchVotes.mock.calls[0]).toEqual([42, 500, 0]);
    expect(fetchVotes.mock.calls[1]).toEqual([42, 500, 500]);

    const lastPage = await getProposalVotes(
      { proposalId: 42, limit: 50, offset: 550, format: "json" },
      ctx
    );
    expect(lastPage?.votes).toHaveLength(50);
    expect(lastPage?.hasMore).toBe(false);
  });

  it("should keep the summary over all votes when filtering by support", async () => {
    const ctx = makeContextWithSubgraph({
      fetchVotes: async (n) => (n === 42 ? mockVotes : []),
    });

    const result = await getProposalVotes(
      { proposalId: 42, support: "FOR", limit: 50, offset: 0, format: "json" },
      ctx
    );

    expect(result?.summary.totalVoters).toBe(4);
    expect(result?.total).toBe(2);
    expect(result?.hasMore).toBe(false);
  });

  it("should return vote details", async () => {
    const ctx = makeContextWithSubgraph({
      fetchVotes: async (n) => (n === 42 ? mockVotes : []),
    });

    const result = await getProposalVotes({ proposalId: 42, limit: 50, offset: 0, format: "json" }, ctx);
    const vote = result?.votes[0];

    expect(vote).toHaveProperty("voter");
    expect(vote).toHaveProperty("support");
    expect(vote).toHaveProperty("weight");
    expect(vote).toHaveProperty("reason");
    expect(vote).toHaveProperty("timestamp");
    expect(vote).toHaveProperty("transactionHash");
  });

  it("should return null for non-existent proposal", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalById: async () => null,
    });

    // Use hex ID to trigger the fetchProposalById path which returns null when not found
    const result = await getProposalVotes({ proposalId: "0xnonexistent", limit: 50, offset: 0, format: "json" }, ctx);
    expect(result).toBeNull();
  });

  it("should accept hex proposal ID", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalById: async (id) =>
        id === mockProposal.proposalId.toLowerCase() ? mockProposal : null,
      fetchVotes: async (n) => (n === 42 ? mockVotes : []),
    });

    const result = await getProposalVotes({ proposalId: mockProposal.proposalId, limit: 50, offset: 0, format: "json" }, ctx);
    expect(result).not.toBeNull();
    expect(result?.votes).toHaveLength(4);
  });
});
