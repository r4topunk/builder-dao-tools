import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import type { RunContext, SubgraphProposal } from "@builder-dao/cli";
import { ProposalRepository } from "../../src/db/repository.js";
import { SCHEMA } from "../../src/db/schema.js";
import { syncProposals } from "../../src/tools/sync-proposals.js";
import { mockProposal } from "../fixtures/proposals.js";

const TIME_BASE = 1700000000;

/** n proposals, oldest first, each with a distinct id/number/timeCreated. */
function makeProposals(n: number, startIndex = 0): SubgraphProposal[] {
  return Array.from({ length: n }, (_, i) => {
    const index = startIndex + i + 1;
    return {
      ...mockProposal,
      id: `0xdao-${index}`,
      proposalId: `0x${index.toString(16).padStart(64, "0")}`,
      proposalNumber: index,
      title: `Proposal ${index}`,
      timeCreated: String(TIME_BASE + index * 3600),
    };
  });
}

function makeCtx(subgraph: Partial<RunContext["subgraph"]>): RunContext {
  return {
    config: {
      daoAddress: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
      goldskyProjectId: "project_test",
      chainId: 8453,
      rpcUrl: "https://mainnet.base.org",
    },
    subgraph: {
      fetchProposals: async () => [],
      fetchProposalByNumber: async () => null,
      fetchProposalById: async () => null,
      fetchVotes: async () => [],
      fetchRecentProposals: async () => [],
      ...subgraph,
    } as RunContext["subgraph"],
    format: "json",
    pretty: false,
    print: () => {},
  };
}

describe("syncProposals", () => {
  let db: Database.Database;
  let repo: ProposalRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    repo = new ProposalRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("backfills everything on the first run, even without --full", async () => {
    const source = makeProposals(3);
    const fetchProposals = vi.fn(async (first = 50, skip = 0) => source.slice(skip, skip + first));
    const fetchRecentProposals = vi.fn(async () => []);
    const ctx = makeCtx({ fetchProposals, fetchRecentProposals });

    const result = await syncProposals(repo, { full: false }, ctx);

    expect(result.success).toBe(true);
    expect(result.synced).toBe(3);
    expect(fetchProposals).toHaveBeenCalled();
    expect(fetchRecentProposals).not.toHaveBeenCalled();
    expect(repo.listProposals().total).toBe(3);
    // Watermark = newest proposal seen, not `now`
    expect(repo.getLastSyncTime()).toBe(TIME_BASE + 3 * 3600);
  });

  it("pages the incremental sync past the old 100-proposal ceiling", async () => {
    const source = makeProposals(120);
    const fetchRecentProposals = vi.fn(async (_since: number, first = 50, skip = 0) =>
      source.slice(skip, skip + first)
    );
    const ctx = makeCtx({ fetchRecentProposals });

    repo.setLastSyncTime(TIME_BASE);
    const result = await syncProposals(repo, { full: false }, ctx);

    expect(result.success).toBe(true);
    expect(result.synced).toBe(120);
    expect(result.updated).toBe(120);
    expect(repo.listProposals({ limit: 500 }).total).toBe(120);
    // 50 + 50 + 20 → three pages
    expect(fetchRecentProposals).toHaveBeenCalledTimes(3);
    expect(fetchRecentProposals.mock.calls.map((c) => c[2])).toEqual([0, 50, 100]);
    expect(repo.getLastSyncTime()).toBe(TIME_BASE + 120 * 3600);
  });

  it("keeps the watermark frozen when the proposal fetch fails", async () => {
    const ctx = makeCtx({
      fetchRecentProposals: async () => {
        throw new Error("subgraph 500");
      },
    });

    repo.setLastSyncTime(TIME_BASE);
    const result = await syncProposals(repo, { full: false }, ctx);

    expect(result.success).toBe(false);
    expect(result.errors.join(" ")).toMatch(/subgraph 500/);
    expect(repo.getLastSyncTime()).toBe(TIME_BASE);
    expect(result.lastSyncTime).toBe(new Date(TIME_BASE * 1000).toISOString());
  });

  it("does not advance the watermark past a failed page", async () => {
    const source = makeProposals(50);
    let call = 0;
    const ctx = makeCtx({
      fetchRecentProposals: async (_since: number, first = 50, skip = 0) => {
        call++;
        if (call > 1) throw new Error("subgraph 500 on page 2");
        return source.slice(skip, skip + first);
      },
    });

    repo.setLastSyncTime(TIME_BASE);
    const result = await syncProposals(repo, { full: false }, ctx);

    expect(result.success).toBe(false);
    expect(result.synced).toBe(50);
    expect(repo.getLastSyncTime()).toBe(TIME_BASE);
  });

  it("reports vote failures without freezing the watermark", async () => {
    const source = makeProposals(2);
    const ctx = makeCtx({
      fetchProposals: async (first = 50, skip = 0) => source.slice(skip, skip + first),
      fetchVotes: async () => {
        throw new Error("votes unavailable");
      },
    });

    const result = await syncProposals(repo, { full: true }, ctx);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(repo.getLastSyncTime()).toBe(TIME_BASE + 2 * 3600);
  });

  it("re-syncs everything with full=true and keeps a monotonic watermark", async () => {
    const source = makeProposals(2);
    const ctx = makeCtx({
      fetchProposals: async (first = 50, skip = 0) => source.slice(skip, skip + first),
    });

    repo.setLastSyncTime(TIME_BASE + 10 * 3600);
    const result = await syncProposals(repo, { full: true }, ctx);

    expect(result.success).toBe(true);
    expect(result.synced).toBe(2);
    // Older proposals must not pull the watermark backwards
    expect(repo.getLastSyncTime()).toBe(TIME_BASE + 10 * 3600);
  });
});
