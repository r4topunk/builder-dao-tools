import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContractFunctionRevertedError, toFunctionSelector, type Abi } from "viem";
import { castVote } from "../../src/tools/cast-vote.js";
import { makeContextWithSubgraph, TEST_CONFIG } from "../fixtures/context.js";
import { mockProposal } from "../fixtures/proposals.js";
import type { RunContext } from "../../src/context.js";

const readContract = vi.fn();
const simulateContract = vi.fn();
const writeContract = vi.fn();
const waitForTransactionReceipt = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ readContract, simulateContract, waitForTransactionReceipt }),
    createWalletClient: () => ({ writeContract }),
  };
});

vi.mock("../../src/subgraph/dao.js", () => ({
  fetchDaoMetadata: vi.fn(async () => ({
    id: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
    name: "Test DAO",
    symbol: "TEST",
    governorAddress: "0x2ff7852a23e408cb6b7ba5c89384672eb88dab2e",
    treasuryAddress: "0x0000000000000000000000000000000000000002",
    auctionAddress: "0x0000000000000000000000000000000000000003",
    metadataAddress: "0x0000000000000000000000000000000000000004",
  })),
}));

const TEST_PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const TX_HASH = `0x${"ab".repeat(32)}` as const;

function makeVotingContext(): RunContext {
  const ctx = makeContextWithSubgraph({
    fetchProposalByNumber: async (n) => (n === 42 ? mockProposal : null),
  });
  return {
    ...ctx,
    config: { ...TEST_CONFIG, privateKey: TEST_PRIVATE_KEY },
  };
}

function alreadyVotedError(): ContractFunctionRevertedError {
  const abi = [{ type: "error", name: "ALREADY_VOTED", inputs: [] }] as unknown as Abi;
  return new ContractFunctionRevertedError({
    abi,
    data: toFunctionSelector("ALREADY_VOTED()"),
    functionName: "castVote",
  });
}

describe("castVote", () => {
  beforeEach(() => {
    readContract.mockReset();
    simulateContract.mockReset();
    writeContract.mockReset();
    waitForTransactionReceipt.mockReset();

    // Active proposal, snapshot block, non-zero voting power
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case "state":
          return 1;
        case "proposalSnapshot":
          return 12345678n;
        case "getVotes":
          return 5n;
        default:
          throw new Error(`Unexpected read: ${functionName}`);
      }
    });
    simulateContract.mockResolvedValue({ result: 5n });
    writeContract.mockResolvedValue(TX_HASH);
    waitForTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 999n });
  });

  it("requires a private key", async () => {
    const ctx = makeContextWithSubgraph({});
    await expect(
      castVote({ proposalId: 42, support: "FOR" }, ctx)
    ).rejects.toThrow(/PRIVATE_KEY/);
  });

  it("simulates castVote before writing and returns the receipt", async () => {
    const result = await castVote({ proposalId: 42, support: "FOR" }, makeVotingContext());

    expect(simulateContract).toHaveBeenCalledTimes(1);
    const simulateArgs = simulateContract.mock.calls[0]![0];
    expect(simulateArgs.functionName).toBe("castVote");
    expect(simulateArgs.args).toEqual([mockProposal.proposalId, 1n]);
    expect(simulateArgs.account.address).toBeDefined();

    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe(TX_HASH);
    expect(result.support).toBe("FOR");
  });

  it("simulates castVoteWithReason when a reason is given", async () => {
    await castVote(
      { proposalId: 42, support: "AGAINST", reason: "  not convinced  " },
      makeVotingContext()
    );

    expect(simulateContract.mock.calls[0]![0].functionName).toBe("castVoteWithReason");
    expect(simulateContract.mock.calls[0]![0].args).toEqual([
      mockProposal.proposalId,
      0n,
      "not convinced",
    ]);
    expect(writeContract.mock.calls[0]![0].functionName).toBe("castVoteWithReason");
  });

  it("never calls the nonexistent hasVoted getter", async () => {
    await castVote({ proposalId: 42, support: "FOR" }, makeVotingContext());

    const readFunctions = readContract.mock.calls.map((c) => c[0].functionName);
    expect(readFunctions).not.toContain("hasVoted");
    expect(readFunctions).toEqual(expect.arrayContaining(["state", "proposalSnapshot", "getVotes"]));
  });

  it("maps an ALREADY_VOTED revert to the friendly error and does not write", async () => {
    simulateContract.mockRejectedValueOnce(alreadyVotedError());

    await expect(
      castVote({ proposalId: 42, support: "FOR" }, makeVotingContext())
    ).rejects.toThrow(/already voted on this proposal/);

    expect(writeContract).not.toHaveBeenCalled();
  });

  it("passes other revert reasons through", async () => {
    simulateContract.mockRejectedValueOnce(new Error("execution reverted: INVALID_VOTE"));

    await expect(
      castVote({ proposalId: 42, support: "FOR" }, makeVotingContext())
    ).rejects.toThrow(/simulation reverted: execution reverted: INVALID_VOTE/);

    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rejects non-active proposals before simulating", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "state") return 7; // Executed
      if (functionName === "proposalSnapshot") return 12345678n;
      return 5n;
    });

    await expect(
      castVote({ proposalId: 42, support: "FOR" }, makeVotingContext())
    ).rejects.toThrow(/proposal is Executed, not Active/);

    expect(simulateContract).not.toHaveBeenCalled();
  });

  it("rejects wallets with zero voting power before simulating", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "state") return 1;
      if (functionName === "proposalSnapshot") return 12345678n;
      return 0n;
    });

    await expect(
      castVote({ proposalId: 42, support: "FOR" }, makeVotingContext())
    ).rejects.toThrow(/0 voting power/);

    expect(simulateContract).not.toHaveBeenCalled();
  });
});
