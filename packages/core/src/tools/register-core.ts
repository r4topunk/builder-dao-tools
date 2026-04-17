import { parseArgs } from "node:util";
import { z } from "zod";
import { registerCommand, registerTool } from "../registry.js";
import { listProposals, listProposalsSchema } from "./list-proposals.js";
import { getProposal, getProposalSchema } from "./get-proposal.js";
import { getProposalVotes, getProposalVotesSchema } from "./get-proposal-votes.js";
import { castVote, castVoteSchema } from "./cast-vote.js";
import {
  resolveEns,
  resolveEnsSchema,
  resolveEnsBatch,
  resolveEnsBatchSchema,
} from "./resolve-ens.js";

export function registerCoreCommands(): void {
  registerCommand({
    name: "proposals",
    description: "List proposals for the configured Builder DAO",
    usage: "proposals [--status STATUS] [--limit N] [--offset N] [--order asc|desc]",
    async run(args, ctx) {
      const { values } = parseArgs({
        args,
        options: {
          status: { type: "string" },
          limit: { type: "string", default: "20" },
          offset: { type: "string", default: "0" },
          order: { type: "string", default: "desc" },
        },
      });
      const result = await listProposals(
        listProposalsSchema.parse({
          status: values.status,
          limit: parseInt(values.limit!, 10),
          offset: parseInt(values.offset!, 10),
          order: values.order,
          format: ctx.format,
        }),
        ctx
      );
      ctx.print(result);
    },
  });

  registerCommand({
    name: "proposal",
    description: "Get a proposal by hex ID or proposal number",
    usage: "proposal <id>",
    async run(args, ctx) {
      const { positionals } = parseArgs({ args, allowPositionals: true, options: {} });
      const id = positionals[0];
      if (!id) throw new Error("Usage: builder-dao proposal <id>");
      const parsed = Number(id);
      const result = await getProposal(
        getProposalSchema.parse({ id: Number.isNaN(parsed) ? id : parsed, hideDescription: false }),
        ctx
      );
      if (!result) throw new Error(`Proposal ${id} not found`);
      ctx.print(result);
    },
  });

  registerCommand({
    name: "votes",
    description: "List votes on a proposal",
    usage: "votes <id> [--support FOR|AGAINST|ABSTAIN] [--limit N] [--offset N]",
    async run(args, ctx) {
      const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: {
          support: { type: "string" },
          limit: { type: "string", default: "50" },
          offset: { type: "string", default: "0" },
        },
      });
      const id = positionals[0];
      if (!id) throw new Error("Usage: builder-dao votes <id>");
      const parsed = Number(id);
      const result = await getProposalVotes(
        getProposalVotesSchema.parse({
          proposalId: Number.isNaN(parsed) ? id : parsed,
          ...(values.support && { support: values.support }),
          limit: parseInt(values.limit!, 10),
          offset: parseInt(values.offset!, 10),
          format: ctx.format,
        }),
        ctx
      );
      if (!result) throw new Error(`Proposal ${id} not found`);
      ctx.print(result);
    },
  });

  registerCommand({
    name: "vote",
    description: "Cast an on-chain vote (requires PRIVATE_KEY)",
    usage: "vote <id> FOR|AGAINST|ABSTAIN [--reason \"...\"]",
    async run(args, ctx) {
      const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: { reason: { type: "string" } },
      });
      const [id, support] = positionals;
      if (!id || !support) throw new Error("Usage: builder-dao vote <id> FOR|AGAINST|ABSTAIN");
      const parsed = Number(id);
      const result = await castVote(
        castVoteSchema.parse({
          proposalId: Number.isNaN(parsed) ? id : parsed,
          support,
          reason: values.reason,
        }),
        ctx
      );
      ctx.print(result);
    },
  });

  registerCommand({
    name: "ens",
    description: "Resolve one or more addresses to ENS",
    usage: "ens <addr> [<addr2> ...]",
    async run(args, ctx) {
      const addresses = args.filter((a) => !a.startsWith("--"));
      if (addresses.length === 0) throw new Error("Usage: builder-dao ens <addr>");
      if (addresses.length === 1) {
        const addr = addresses[0];
        if (!addr) throw new Error("Usage: builder-dao ens <addr>");
        const result = await resolveEns({ address: addr });
        ctx.print(result);
      } else {
        const result = await resolveEnsBatch(resolveEnsBatchSchema.parse({
          addresses,
          format: ctx.format,
        }));
        ctx.print(result);
      }
    },
  });

  registerTool({
    name: "list_proposals",
    description:
      "List proposals for the configured Builder DAO with optional status filter. Use format='toon' for ~40% token savings.",
    inputSchema: listProposalsSchema,
    handler: async (input, ctx) =>
      listProposals(listProposalsSchema.parse(input), ctx),
  });

  registerTool({
    name: "get_proposal",
    description:
      "Get a specific proposal by hex ID or number. Set hideDescription=true to reduce token usage.",
    inputSchema: getProposalSchema,
    handler: async (input, ctx) => getProposal(getProposalSchema.parse(input), ctx),
  });

  registerTool({
    name: "get_proposal_votes",
    description:
      "Get votes for a specific proposal, optionally filtered by FOR/AGAINST/ABSTAIN. Use format='toon' for ~40% token savings.",
    inputSchema: getProposalVotesSchema,
    handler: async (input, ctx) =>
      getProposalVotes(getProposalVotesSchema.parse(input), ctx),
  });

  registerTool({
    name: "resolve_ens",
    description:
      "Resolve an Ethereum address to ENS name + avatar. Returns displayName, name, avatar, address.",
    inputSchema: resolveEnsSchema,
    handler: async (input) => resolveEns(resolveEnsSchema.parse(input)),
  });

  registerTool({
    name: "resolve_ens_batch",
    description:
      "Resolve many Ethereum addresses to ENS in one call. Use format='toon' for ~25% token savings.",
    inputSchema: resolveEnsBatchSchema,
    handler: async (input) => resolveEnsBatch(resolveEnsBatchSchema.parse(input)),
  });

  registerTool({
    name: "cast_vote",
    description:
      "Cast a vote on-chain on an active Builder DAO proposal. Requires PRIVATE_KEY env. Governor is resolved from the configured DAO address via subgraph.",
    inputSchema: castVoteSchema,
    handler: async (input, ctx) => castVote(castVoteSchema.parse(input), ctx),
  });
}
