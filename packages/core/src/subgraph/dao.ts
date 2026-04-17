import type { DaoConfig } from "../config.js";
import { getSubgraphUrl } from "../config.js";
import { DAO_BY_ID_QUERY } from "./queries.js";

export interface DaoMetadata {
  id: string;
  name: string | null;
  symbol: string | null;
  governorAddress: `0x${string}`;
  treasuryAddress: `0x${string}`;
  auctionAddress: `0x${string}`;
  metadataAddress: `0x${string}`;
}

const cache = new Map<string, DaoMetadata>();

export async function fetchDaoMetadata(cfg: DaoConfig): Promise<DaoMetadata> {
  const key = `${cfg.goldskyProjectId}:${cfg.daoAddress.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const url = getSubgraphUrl(cfg);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: DAO_BY_ID_QUERY,
      variables: { daoAddress: cfg.daoAddress.toLowerCase() },
    }),
  });
  if (!response.ok) {
    throw new Error(`Subgraph request failed: ${response.status}`);
  }
  const body = (await response.json()) as {
    data?: { dao: DaoMetadata | null };
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) {
    throw new Error(`Subgraph query error: ${body.errors.map((e) => e.message).join(", ")}`);
  }
  const dao = body.data?.dao;
  if (!dao) {
    throw new Error(
      `DAO ${cfg.daoAddress} is not indexed by subgraph ${cfg.goldskyProjectId}`
    );
  }
  cache.set(key, dao);
  return dao;
}

export function clearDaoMetadataCache(): void {
  cache.clear();
}
