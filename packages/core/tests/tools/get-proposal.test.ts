import { describe, it, expect } from "vitest";
import { getProposal } from "../../src/tools/get-proposal.js";
import { makeContextWithSubgraph } from "../fixtures/context.js";
import { mockProposal, mockProposalExecuted } from "../fixtures/proposals.js";

describe("getProposal", () => {
  it("should get proposal by number", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalByNumber: async (n) => (n === 42 ? mockProposal : null),
    });

    const result = await getProposal({ id: 42, hideDescription: false }, ctx);

    expect(result).not.toBeNull();
    expect(result?.proposalNumber).toBe(42);
    expect(result?.title).toBe("Sponsor Skater X for Olympics");
  });

  it("should get proposal by hex ID", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalById: async (id) =>
        id === mockProposal.proposalId.toLowerCase() ? mockProposal : null,
    });

    const result = await getProposal({ id: mockProposal.proposalId, hideDescription: false }, ctx);

    expect(result).not.toBeNull();
    expect(result?.proposalNumber).toBe(42);
  });

  it("should get proposal by string number", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalByNumber: async (n) => (n === 42 ? mockProposal : null),
    });

    const result = await getProposal({ id: "42", hideDescription: false }, ctx);

    expect(result).not.toBeNull();
    expect(result?.proposalNumber).toBe(42);
  });

  it("should return null for non-existent proposal", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalByNumber: async () => null,
      fetchProposalById: async () => null,
    });

    const byNumber = await getProposal({ id: 999, hideDescription: false }, ctx);
    const byId = await getProposal({ id: "0xnonexistent", hideDescription: false }, ctx);

    expect(byNumber).toBeNull();
    expect(byId).toBeNull();
  });

  it("should include all detailed fields", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalByNumber: async (n) => (n === 42 ? mockProposal : null),
    });

    const result = await getProposal({ id: 42, hideDescription: false }, ctx);

    expect(result).toHaveProperty("proposalId");
    expect(result).toHaveProperty("proposalNumber");
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("description");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("proposer");
    expect(result).toHaveProperty("forVotes");
    expect(result).toHaveProperty("againstVotes");
    expect(result).toHaveProperty("abstainVotes");
    expect(result).toHaveProperty("quorumVotes");
    expect(result).toHaveProperty("executed");
    expect(result).toHaveProperty("totalVotes");
    expect(result).toHaveProperty("participationRate");
    expect(result).toHaveProperty("result");
  });

  it("should compute totalVotes correctly", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalByNumber: async (n) => (n === 42 ? mockProposal : null),
    });

    const result = await getProposal({ id: 42, hideDescription: false }, ctx);

    // mockProposal has forVotes: 10, againstVotes: 5, abstainVotes: 2
    expect(result?.totalVotes).toBe(17);
  });

  it("should compute result correctly", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalByNumber: async (n) => {
        if (n === 42) return mockProposal;
        if (n === 38) return mockProposalExecuted;
        return null;
      },
    });

    const passing = await getProposal({ id: 42, hideDescription: false }, ctx);
    expect(passing?.result).toBe("PASSING"); // 10 for > 5 against

    const executed = await getProposal({ id: 38, hideDescription: false }, ctx);
    expect(executed?.result).toBe("PASSING"); // 50 for > 10 against
  });

  it("should compute participation rate", async () => {
    const ctx = makeContextWithSubgraph({
      fetchProposalByNumber: async (n) => (n === 42 ? mockProposal : null),
    });

    const result = await getProposal({ id: 42, hideDescription: false }, ctx);

    // 17 votes / 8 quorum = 212.5%
    expect(result?.participationRate).toBe("212.5% of quorum");
  });
});
