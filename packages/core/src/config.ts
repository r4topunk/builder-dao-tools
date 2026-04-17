export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface DaoConfig {
  daoAddress: `0x${string}`;
  goldskyProjectId: string;
  chainId: number;
  rpcUrl: string;
  privateKey?: `0x${string}`;
}

const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_PRIVKEY_RE = /^0x[a-fA-F0-9]{64}$/;

function extractFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

export function resolveConfig(
  argv: string[],
  env: NodeJS.ProcessEnv
): DaoConfig {
  const daoAddress = (extractFlag(argv, "--dao") ?? env.DAO_ADDRESS)?.toLowerCase();
  const goldskyProjectId =
    extractFlag(argv, "--subgraph-project") ?? env.GOLDSKY_PROJECT_ID;
  const rpcUrl =
    extractFlag(argv, "--rpc-url") ?? env.BASE_RPC_URL ?? "https://mainnet.base.org";
  const chainId = env.CHAIN_ID ? parseInt(env.CHAIN_ID, 10) : 8453;
  if (env.CHAIN_ID !== undefined && (Number.isNaN(chainId) || chainId <= 0)) {
    throw new ConfigError(
      `Invalid CHAIN_ID: ${env.CHAIN_ID}. Expected a positive integer.`
    );
  }

  if (!daoAddress) {
    throw new ConfigError(
      "Missing DAO address. Provide --dao <addr> or set DAO_ADDRESS env."
    );
  }
  if (!HEX_ADDRESS_RE.test(daoAddress)) {
    throw new ConfigError(
      `Invalid DAO address: ${daoAddress}. Expected 0x-prefixed 20-byte hex.`
    );
  }
  if (!goldskyProjectId) {
    throw new ConfigError(
      "Missing Goldsky project ID. Provide --subgraph-project <id> or set GOLDSKY_PROJECT_ID env."
    );
  }

  const privateKey = env.PRIVATE_KEY;
  if (privateKey && !HEX_PRIVKEY_RE.test(privateKey)) {
    throw new ConfigError("PRIVATE_KEY must be 0x-prefixed 32-byte hex.");
  }

  return {
    daoAddress: daoAddress as `0x${string}`,
    goldskyProjectId,
    chainId,
    rpcUrl,
    privateKey: privateKey as `0x${string}` | undefined,
  };
}

export function getSubgraphUrl(cfg: DaoConfig): string {
  return `https://api.goldsky.com/api/public/${cfg.goldskyProjectId}/subgraphs/nouns-builder-base-mainnet/latest/gn`;
}
