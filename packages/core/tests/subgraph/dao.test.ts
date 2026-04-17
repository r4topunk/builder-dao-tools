import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDaoMetadata, clearDaoMetadataCache } from "../../src/subgraph/dao.js";
import type { DaoConfig } from "../../src/config.js";

const baseCfg: DaoConfig = {
  daoAddress: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
  goldskyProjectId: "project_test",
  chainId: 8453,
  rpcUrl: "https://mainnet.base.org",
};

describe("fetchDaoMetadata", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearDaoMetadataCache();
  });

  it("returns parsed dao record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              dao: {
                id: baseCfg.daoAddress,
                name: "Gnars",
                symbol: "GNAR",
                governorAddress: "0x3dd4e53a232b7b715c9ae455f4e732465ed71b4c",
                treasuryAddress: "0x72ad986ebac0246d2b3c565ab2a1ce3a14ce6f88",
                auctionAddress: "0x494eaa55ecf6310658b8fc004b0888dcb698097f",
                metadataAddress: "0xdc9799d424ebfdcf5310f3bad3ddcce3931d4b58",
              },
            },
          })
        )
      )
    );
    const dao = await fetchDaoMetadata(baseCfg);
    expect(dao.governorAddress).toBe("0x3dd4e53a232b7b715c9ae455f4e732465ed71b4c");
    expect(dao.name).toBe("Gnars");
  });

  it("throws when dao not indexed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { dao: null } }))
      )
    );
    await expect(fetchDaoMetadata(baseCfg)).rejects.toThrow(/not indexed/i);
  });

  it("caches results per daoAddress", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            dao: {
              id: baseCfg.daoAddress,
              name: "X",
              symbol: "X",
              governorAddress: "0x1111111111111111111111111111111111111111",
              treasuryAddress: "0x2222222222222222222222222222222222222222",
              auctionAddress: "0x3333333333333333333333333333333333333333",
              metadataAddress: "0x4444444444444444444444444444444444444444",
            },
          },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchDaoMetadata(baseCfg);
    await fetchDaoMetadata(baseCfg);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when subgraph returns HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 }))
    );
    await expect(fetchDaoMetadata(baseCfg)).rejects.toThrow(/500/);
  });

  it("throws when subgraph returns GraphQL errors array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            errors: [{ message: "Invalid query" }, { message: "Timeout" }],
          })
        )
      )
    );
    await expect(fetchDaoMetadata(baseCfg)).rejects.toThrow(/Subgraph query error/);
  });
});
