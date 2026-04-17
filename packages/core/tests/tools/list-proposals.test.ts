import { describe, it, expect } from "vitest";
import { listProposals } from "../../src/tools/list-proposals.js";
import { makeContextWithSubgraph } from "../fixtures/context.js";
import { mockProposal, mockProposalExecuted, mockProposalDefeated } from "../fixtures/proposals.js";

const allProposals = [mockProposal, mockProposalExecuted, mockProposalDefeated];

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

  it("should paginate results", async () => {
    // The new implementation uses status-filter-based client-side pagination for hasMore.
    // mockProposal → SUCCEEDED, mockProposalExecuted → EXECUTED, mockProposalDefeated → DEFEATED.
    // Use a non-EXECUTED filter: only 2 proposals (SUCCEEDED + DEFEATED) match broadly,
    // but target DEFEATED to get 1 result and SUCCEEDED to get 1 result.
    // Instead, fetch all 3 with no filter and paginate at the subgraph level via the stub.
    const ctx = makeContextWithSubgraph({
      // Respect the first/skip params to simulate real subgraph pagination
      fetchProposals: async (first = 20, skip = 0) => allProposals.slice(skip, skip + first),
    });

    const page1 = await listProposals({ limit: 2, offset: 0, order: "desc", format: "json" }, ctx);
    const page2 = await listProposals({ limit: 2, offset: 2, order: "desc", format: "json" }, ctx);

    expect(page1.proposals).toHaveLength(2);
    expect(page2.proposals).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });

  it("should filter by status", async () => {
    // When status filter is set, listProposals fetches up to 200 and filters client-side
    const ctx = makeContextWithSubgraph({
      fetchProposals: async () => allProposals,
    });

    const executed = await listProposals({ status: "EXECUTED", limit: 20, offset: 0, order: "desc", format: "json" }, ctx);

    expect(executed.proposals).toHaveLength(1);
    expect(executed.proposals[0].proposalNumber).toBe(38);
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

  it("should respect order parameter", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposals: async () => allProposals,
    });

    const asc = await listProposals({ limit: 20, offset: 0, order: "asc", format: "json" }, ctx);
    const desc = await listProposals({ limit: 20, offset: 0, order: "desc", format: "json" }, ctx);

    expect(asc.proposals[0].proposalNumber).not.toBe(desc.proposals[0].proposalNumber);
  });
});
