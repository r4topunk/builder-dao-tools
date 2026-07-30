import { z } from "zod";
import type { ProposalRepository } from "../db/repository.js";
import type { RunContext, SubgraphProposal } from "@builder-dao/cli";

export const syncProposalsSchema = z.object({
  full: z.boolean().default(false).describe("If true, re-sync all proposals. Default: incremental sync"),
});

export type SyncProposalsInput = z.infer<typeof syncProposalsSchema>;

export interface SyncProposalsOutput {
  /** false when anything failed — the CLI turns this into a non-zero exit */
  success: boolean;
  synced: number;
  updated: number;
  errors: string[];
  /** Watermark stored after this run (unchanged when the proposal fetch failed) */
  lastSyncTime: string;
}

const BATCH_SIZE = 50;

export async function syncProposals(
  repo: ProposalRepository,
  input: SyncProposalsInput,
  ctx: RunContext
): Promise<SyncProposalsOutput> {
  const errors: string[] = [];
  let synced = 0;
  let updated = 0;
  // Only a *proposal* fetch failure may freeze the watermark: the failed window
  // must be retried on the next run. Vote failures are reported but do not
  // freeze it, otherwise one flaky proposal would re-sync everything forever.
  let proposalFetchFailed = false;
  let maxTimeCreated = 0;

  function trackWatermark(proposals: SubgraphProposal[]): void {
    for (const proposal of proposals) {
      const created = parseInt(proposal.timeCreated, 10);
      if (Number.isFinite(created) && created > maxTimeCreated) {
        maxTimeCreated = created;
      }
    }
  }

  async function syncVotes(proposals: SubgraphProposal[]): Promise<void> {
    for (const proposal of proposals) {
      try {
        const votes = await ctx.subgraph.fetchVotes(proposal.proposalNumber);
        if (votes.length > 0) {
          repo.upsertVotes(votes, proposal.proposalId);
        }
      } catch (err) {
        errors.push(`Failed to fetch votes for proposal ${proposal.proposalNumber}: ${err}`);
      }
    }
  }

  async function runFullSync(): Promise<void> {
    let offset = 0;
    for (;;) {
      let proposals: SubgraphProposal[];
      try {
        proposals = await ctx.subgraph.fetchProposals(BATCH_SIZE, offset);
      } catch (err) {
        errors.push(`Failed to fetch proposals at offset ${offset}: ${err}`);
        proposalFetchFailed = true;
        return;
      }

      if (proposals.length === 0) return;

      synced += repo.upsertProposals(proposals);
      trackWatermark(proposals);
      offset += proposals.length;

      await syncVotes(proposals);

      if (proposals.length < BATCH_SIZE) return;
    }
  }

  async function runIncrementalSync(since: number): Promise<void> {
    let skip = 0;
    for (;;) {
      let proposals: SubgraphProposal[];
      try {
        proposals = await ctx.subgraph.fetchRecentProposals(since, BATCH_SIZE, skip);
      } catch (err) {
        errors.push(`Failed to fetch recent proposals at offset ${skip}: ${err}`);
        proposalFetchFailed = true;
        return;
      }

      if (proposals.length === 0) return;

      const count = repo.upsertProposals(proposals);
      synced += count;
      // In incremental, everything fetched is considered an update
      updated += count;
      trackWatermark(proposals);
      skip += proposals.length;

      await syncVotes(proposals);

      if (proposals.length < BATCH_SIZE) return;
    }
  }

  const lastSync = repo.getLastSyncTime();

  // No watermark yet → a first incremental run would only see `timeCreated_gt 0`
  // worth of pages; run the full backfill instead of leaving a partial DB.
  if (input.full || lastSync === null) {
    await runFullSync();
  } else {
    await runIncrementalSync(lastSync);
  }

  // Watermark = newest proposal actually stored (not `now`), so clock skew
  // between this machine and the indexer cannot open a hole.
  let watermark = lastSync ?? 0;
  if (!proposalFetchFailed && maxTimeCreated > watermark) {
    watermark = maxTimeCreated;
    repo.setLastSyncTime(watermark);
  } else if (!proposalFetchFailed && lastSync === null) {
    // First run with nothing to store: record the watermark so the next run is incremental
    repo.setLastSyncTime(watermark);
  }

  return {
    success: errors.length === 0,
    synced,
    updated,
    errors,
    lastSyncTime: new Date(watermark * 1000).toISOString(),
  };
}
