import type { DaoConfig } from "./config.js";
import type { SubgraphClient } from "./subgraph/client.js";
import { createSubgraphClient } from "./subgraph/client.js";
import { encodeResponse, type OutputFormat } from "./utils/encoder.js";

export interface RunContext {
  config: DaoConfig;
  subgraph: SubgraphClient;
  format: OutputFormat;
  pretty: boolean;
  print(data: unknown): void;
}

export function createContext(
  config: DaoConfig,
  opts: { format?: OutputFormat; pretty?: boolean } = {}
): RunContext {
  const format = opts.format ?? "json";
  const pretty = opts.pretty ?? false;
  return {
    config,
    subgraph: createSubgraphClient(config),
    format,
    pretty,
    print(data: unknown) {
      if (format === "toon") {
        console.log(encodeResponse(data, "toon"));
      } else {
        console.log(pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
      }
    },
  };
}
