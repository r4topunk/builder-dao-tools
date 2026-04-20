import { z } from "zod";
import { createWalletClient, createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { RunContext } from "../context.js";
import { fetchDaoMetadata } from "../subgraph/dao.js";

const SUPPORT_MAP = { AGAINST: 0n, FOR: 1n, ABSTAIN: 2n } as const;

const PROPOSAL_STATE_NAMES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
  "Vetoed",
] as const;

const CAST_VOTE_ABI = [
  {
    type: "function",
    name: "castVote",
    inputs: [
      { name: "_proposalId", type: "bytes32", internalType: "bytes32" },
      { name: "_support", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "castVoteWithReason",
    inputs: [
      { name: "_proposalId", type: "bytes32", internalType: "bytes32" },
      { name: "_support", type: "uint256", internalType: "uint256" },
      { name: "_reason", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "state",
    inputs: [{ name: "_proposalId", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalSnapshot",
    inputs: [{ name: "_proposalId", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVotes",
    inputs: [
      { name: "_account", type: "address", internalType: "address" },
      { name: "_timepoint", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasVoted",
    inputs: [
      { name: "_proposalId", type: "bytes32", internalType: "bytes32" },
      { name: "_voter", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
] as const;

export const castVoteSchema = z.object({
  proposalId: z
    .union([z.string(), z.number()])
    .describe("Proposal ID (hex 0x...) or proposal number"),
  support: z.enum(["FOR", "AGAINST", "ABSTAIN"]).describe("Vote choice"),
  reason: z.string().optional().describe("Optional on-chain reason"),
});

export type CastVoteInput = z.infer<typeof castVoteSchema>;

export interface CastVoteOutput {
  success: boolean;
  transactionHash: string;
  voter: string;
  proposalId: string;
  support: string;
  reason?: string;
  blockNumber?: string;
  governor: string;
}

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

async function resolveProposalId(
  id: string | number,
  ctx: RunContext
): Promise<Hex> {
  if (typeof id === "number" || (typeof id === "string" && !id.startsWith("0x"))) {
    const n = typeof id === "string" ? parseInt(id, 10) : id;
    const p = await ctx.subgraph.fetchProposalByNumber(n);
    if (!p) throw new Error(`Proposal #${id} not found`);
    return p.proposalId as Hex;
  }
  if (!BYTES32_RE.test(id)) {
    throw new Error(
      `Invalid proposal ID "${id}". Hex proposal IDs must be 0x-prefixed 32-byte hex (66 chars total). Pass the proposal number instead if you don't have the full hash.`
    );
  }
  return id as Hex;
}

export async function castVote(
  input: CastVoteInput,
  ctx: RunContext
): Promise<CastVoteOutput> {
  if (!ctx.config.privateKey) {
    throw new Error(
      "PRIVATE_KEY environment variable is required to cast votes."
    );
  }

  const dao = await fetchDaoMetadata(ctx.config);
  const governor = dao.governorAddress;

  const account = privateKeyToAccount(ctx.config.privateKey);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(ctx.config.rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: base,
    transport: http(ctx.config.rpcUrl),
  });

  const proposalId = await resolveProposalId(input.proposalId, ctx);
  const support = SUPPORT_MAP[input.support];
  const trimmedReason = input.reason?.trim();

  const [stateRaw, snapshot, alreadyVoted] = await Promise.all([
    publicClient.readContract({
      abi: CAST_VOTE_ABI,
      address: governor,
      functionName: "state",
      args: [proposalId],
    }),
    publicClient.readContract({
      abi: CAST_VOTE_ABI,
      address: governor,
      functionName: "proposalSnapshot",
      args: [proposalId],
    }),
    publicClient.readContract({
      abi: CAST_VOTE_ABI,
      address: governor,
      functionName: "hasVoted",
      args: [proposalId, account.address],
    }),
  ]);
  const stateName = PROPOSAL_STATE_NAMES[Number(stateRaw)] ?? `Unknown(${stateRaw})`;
  if (Number(stateRaw) !== 1) {
    throw new Error(
      `Cannot vote - proposal is ${stateName}, not Active. Votes are only accepted while a proposal is in the Active state.`
    );
  }
  if (alreadyVoted) {
    throw new Error(
      `Cannot vote - wallet ${account.address} already voted on this proposal. Each address can only vote once per proposal.`
    );
  }

  const votingPower = await publicClient.readContract({
    abi: CAST_VOTE_ABI,
    address: governor,
    functionName: "getVotes",
    args: [account.address, snapshot],
  });
  if (votingPower === 0n) {
    throw new Error(
      `Cannot vote - wallet ${account.address} has 0 voting power at proposal snapshot (block ${snapshot}). ` +
        `You need to own ${dao.symbol ?? "DAO"} tokens or have delegated voting power before the snapshot.`
    );
  }

  let txHash: Hex;
  if (trimmedReason && trimmedReason.length > 0) {
    txHash = await walletClient.writeContract({
      account,
      abi: CAST_VOTE_ABI,
      address: governor,
      functionName: "castVoteWithReason",
      args: [proposalId, support, trimmedReason],
      chain: base,
    });
  } else {
    txHash = await walletClient.writeContract({
      account,
      abi: CAST_VOTE_ABI,
      address: governor,
      functionName: "castVote",
      args: [proposalId, support],
      chain: base,
    });
  }

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000,
  });

  return {
    success: receipt.status === "success",
    transactionHash: txHash,
    voter: account.address,
    proposalId,
    support: input.support,
    reason: trimmedReason || undefined,
    blockNumber: receipt.blockNumber.toString(),
    governor,
  };
}
