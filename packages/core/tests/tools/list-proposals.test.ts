import { describe, it, expect, vi } from "vitest";
import { listProposals } from "../../src/tools/list-proposals.js";
import { makeContextWithSubgraph } from "../fixtures/context.js";
import { mockProposal, mockProposalExecuted, mockProposalDefeated } from "../fixtures/proposals.js";
import type { SubgraphProposal } from "../../src/subgraph/types.js";

const allProposals = [mockProposal, mockProposalExecuted, mockProposalDefeated];

/** Proposals 1..n, newest first — the order the subgraph returns them. */
function makeProposalsDesc(n: number): SubgraphProposal[] {
  const asc = Array.from({ length: n }, (_, i) => ({
    ...mockProposal,
    id: `0xdao-${i + 1}`,
    proposalId: `0x${(i + 1).toString(16).padStart(64, "0")}`,
    proposalNumber: i + 1,
    title: `Proposal ${i + 1}`,
    timeCreated: String(1700000000 + (i + 1) * 3600),
  }));
  return asc.reverse();
}

/** Subgraph stub that honours first/skip over a fixed source list. */
function pagedFetch(source: SubgraphProposal[]) {
  return vi.fn(async (first = 20, skip = 0) => source.slice(skip, skip + first));
}

describe("listProposals", () => {
  it("should return all proposals with defaults", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposals: async () => allProposals,
    });

    const result = await listProposals({ limit: 20, offset: 0, order: "desc", format: "json" }, ctx);

    expect(result.proposals).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it("should report total and hasMore over the full set, not the page", async () => {
    const source = makeProposalsDesc(5);
    const ctx = makeContextWithSubgraph({ fetchProposals: pagedFetch(source) });

    const page1 = await listProposals({ limit: 2, offset: 0, order: "desc", format: "json" }, ctx);
    const page2 = await listProposals({ limit: 2, offset: 2, order: "desc", format: "json" }, ctx);
    const page3 = await listProposals({ limit: 2, offset: 4, order: "desc", format: "json" }, ctx);

    expect(page1.proposals).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.hasMore).toBe(true);

    expect(page2.total).toBe(5);
    expect(page2.hasMore).toBe(true);

    expect(page3.proposals).toHaveLength(1);
    expect(page3.total).toBe(5);
    expect(page3.hasMore).toBe(false);
  });

  it("should page through the subgraph until the full set is fetched", async () => {
    const source = makeProposalsDesc(250);
    const fetchProposals = pagedFetch(source);
    const ctx = makeContextWithSubgraph({ fetchProposals });

    const result = await listProposals({ limit: 20, offset: 0, order: "desc", format: "json" }, ctx);

    expect(result.total).toBe(250);
    expect(result.proposals).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    // 200 + 50 → two subgraph round trips
    expect(fetchProposals).toHaveBeenCalledTimes(2);
    expect(fetchProposals.mock.calls[0]).toEqual([200, 0]);
    expect(fetchProposals.mock.calls[1]).toEqual([200, 200]);
  });

  it("should filter by status", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposals: async () => allProposals,
    });

    const executed = await listProposals({ status: "EXECUTED", limit: 20, offset: 0, order: "desc", format: "json" }, ctx);

    expect(executed.proposals).toHaveLength(1);
    expect(executed.proposals[0].proposalNumber).toBe(38);
    expect(executed.total).toBe(1);
    expect(executed.hasMore).toBe(false);
  });

  it("should return proposal summary fields", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposals: async () => allProposals,
    });

    const result = await listProposals({ limit: 1, offset: 0, order: "desc", format: "json" }, ctx);

    const proposal = result.proposals[0];
    expect(proposal).toHaveProperty("proposalNumber");
    expect(proposal).toHaveProperty("title");
    expect(proposal).toHaveProperty("status");
    expect(proposal).toHaveProperty("proposer");
    expect(proposal).toHaveProperty("forVotes");
    expect(proposal).toHaveProperty("againstVotes");
    expect(proposal).toHaveProperty("abstainVotes");
    expect(proposal).toHaveProperty("quorumVotes");
    expect(proposal).toHaveProperty("voteStart");
    expect(proposal).toHaveProperty("voteEnd");
    expect(proposal).toHaveProperty("timeCreated");
  });

  it("should order globally, not within a page", async () => {
    const source = makeProposalsDesc(6);
    const ctx = makeContextWithSubgraph({ fetchProposals: pagedFetch(source) });

    const ascPage1 = await listProposals({ limit: 3, offset: 0, order: "asc", format: "json" }, ctx);
    const ascPage2 = await listProposals({ limit: 3, offset: 3, order: "asc", format: "json" }, ctx);
    const descPage1 = await listProposals({ limit: 3, offset: 0, order: "desc", format: "json" }, ctx);
    const descPage2 = await listProposals({ limit: 3, offset: 3, order: "desc", format: "json" }, ctx);

    expect(ascPage1.proposals.map((p) => p.proposalNumber)).toEqual([1, 2, 3]);
    expect(ascPage2.proposals.map((p) => p.proposalNumber)).toEqual([4, 5, 6]);
    expect(descPage1.proposals.map((p) => p.proposalNumber)).toEqual([6, 5, 4]);
    expect(descPage2.proposals.map((p) => p.proposalNumber)).toEqual([3, 2, 1]);
  });

  it("should return the oldest proposals for order=asc", async () => {
    const source = makeProposalsDesc(6);
    const ctx = makeContextWithSubgraph({ fetchProposals: pagedFetch(source) });

    const oldest = await listProposals({ limit: 2, offset: 0, order: "asc", format: "json" }, ctx);

    expect(oldest.proposals.map((p) => p.proposalNumber)).toEqual([1, 2]);
    expect(oldest.total).toBe(6);
    expect(oldest.hasMore).toBe(true);
  });

  it("should respect order parameter when timestamps are identical", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposals: async () => allProposals,
    });

    const asc = await listProposals({ limit: 20, offset: 0, order: "asc", format: "json" }, ctx);
    const desc = await listProposals({ limit: 20, offset: 0, order: "desc", format: "json" }, ctx);

    expect(asc.proposals.map((p) => p.proposalNumber)).toEqual([35, 38, 42]);
    expect(desc.proposals.map((p) => p.proposalNumber)).toEqual([42, 38, 35]);
  });
});
