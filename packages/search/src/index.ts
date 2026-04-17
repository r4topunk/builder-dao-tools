import { parseArgs } from "node:util";
import { z } from "zod";
import { registerCommand, registerTool } from "@builder-dao/cli";
import { openDatabase } from "./db/connection.js";
import { ProposalRepository } from "./db/repository.js";
import { syncProposals, syncProposalsSchema } from "./tools/sync-proposals.js";
import { searchProposals, searchProposalsSchema } from "./tools/search-proposals.js";
import { indexProposalEmbeddings } from "./tools/index-embeddings.js";

registerCommand({
  name: "sync",
  description: "Sync proposals from subgraph into local DB (per-DAO)",
  usage: "sync [--full]",
  async run(args, ctx) {
    const { values } = parseArgs({
      args,
      options: { full: { type: "boolean", default: false } },
    });
    const db = openDatabase(ctx.config);
    const repo = new ProposalRepository(db);
    const result = await syncProposals(repo, { full: values.full ?? false }, ctx);
    ctx.print(result);
  },
});

registerCommand({
  name: "index",
  description: "Generate embeddings for synced proposals",
  usage: "index",
  async run(_args, ctx) {
    const db = openDatabase(ctx.config);
    const repo = new ProposalRepository(db);
    const result = await indexProposalEmbeddings(repo);
    ctx.print(result);
  },
});

registerCommand({
  name: "search",
  description: "Semantic search over synced proposals",
  usage: 'search "<query>" [--status STATUS] [--limit N] [--threshold 0-1]',
  async run(args, ctx) {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        status: { type: "string" },
        limit: { type: "string", default: "5" },
        threshold: { type: "string", default: "0.3" },
      },
    });
    const query = positionals.join(" ");
    if (!query) throw new Error('Usage: builder-dao search "<query>"');
    const db = openDatabase(ctx.config);
    const repo = new ProposalRepository(db);
    const result = await searchProposals(
      repo,
      searchProposalsSchema.parse({
        query,
        status: values.status,
        limit: parseInt(values.limit!, 10),
        threshold: parseFloat(values.threshold!),
        format: ctx.format,
      }),
      ctx
    );
    ctx.print(result);
  },
});

registerTool({
  name: "sync_proposals",
  description:
    "Sync proposals from the Nouns Builder subgraph to the local per-DAO database. Pass full=true for a complete re-sync.",
  inputSchema: syncProposalsSchema,
  handler: async (input, ctx) => {
    const db = openDatabase(ctx.config);
    const repo = new ProposalRepository(db);
    return syncProposals(repo, syncProposalsSchema.parse(input), ctx);
  },
});

registerTool({
  name: "search_proposals",
  description:
    "Semantic search over proposals. Requires sync_proposals + index_embeddings to have been run. Use format='toon' for ~40% token savings.",
  inputSchema: searchProposalsSchema,
  handler: async (input, ctx) => {
    const db = openDatabase(ctx.config);
    const repo = new ProposalRepository(db);
    return searchProposals(repo, searchProposalsSchema.parse(input), ctx);
  },
});

registerTool({
  name: "index_embeddings",
  description:
    "Generate embeddings for synced proposals. Must be run after sync_proposals. Idempotent — only indexes proposals missing embeddings.",
  inputSchema: z.object({}),
  handler: async (_input, ctx) => {
    const db = openDatabase(ctx.config);
    const repo = new ProposalRepository(db);
    const statsBefore = repo.getEmbeddingStats();
    const result = await indexProposalEmbeddings(repo);
    const statsAfter = repo.getEmbeddingStats();
    return {
      ...result,
      stats: {
        totalProposals: statsAfter.totalProposals,
        embeddedProposals: statsAfter.embeddedProposals,
        totalChunks: statsAfter.totalChunks,
        previouslyIndexed: statsBefore.embeddedProposals,
      },
    };
  },
});
