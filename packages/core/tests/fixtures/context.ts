import type { RunContext } from "../../src/context.js";
import type { SubgraphClient } from "../../src/subgraph/client.js";
import type { DaoConfig } from "../../src/config.js";

export const TEST_DAO_ADDRESS =
  "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17" as const;

export const TEST_CONFIG: DaoConfig = {
  daoAddress: TEST_DAO_ADDRESS,
  goldskyProjectId: "project_test",
  chainId: 8453,
  rpcUrl: "https://mainnet.base.org",
};

export function makeContextWithSubgraph(
  subgraph: Partial<SubgraphClient>
): RunContext {
  return {
    config: TEST_CONFIG,
    subgraph: {
      fetchProposals: async () => [],
      fetchProposalByNumber: async () => null,
      fetchProposalById: async () => null,
      fetchVotes: async () => [],
      fetchRecentProposals: async () => [],
      ...subgraph,
    } as SubgraphClient,
    format: "json",
    pretty: false,
    print: () => {},
  };
}
