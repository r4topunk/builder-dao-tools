import { describe, it, expect } from "vitest";
import { resolveConfig, ConfigError } from "../src/config.js";

describe("resolveConfig", () => {
  it("reads daoAddress and goldskyProjectId from env", () => {
    const cfg = resolveConfig([], {
      DAO_ADDRESS: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
      GOLDSKY_PROJECT_ID: "project_test",
    });
    expect(cfg.daoAddress).toBe("0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17");
    expect(cfg.goldskyProjectId).toBe("project_test");
    expect(cfg.chainId).toBe(8453);
    expect(cfg.rpcUrl).toBe("https://mainnet.base.org");
  });

  it("CLI --dao overrides env", () => {
    const cfg = resolveConfig(["--dao", "0xabc0000000000000000000000000000000000000"], {
      DAO_ADDRESS: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
      GOLDSKY_PROJECT_ID: "project_test",
    });
    expect(cfg.daoAddress).toBe("0xabc0000000000000000000000000000000000000");
  });

  it("CLI --subgraph-project overrides env", () => {
    const cfg = resolveConfig(
      ["--subgraph-project", "project_x"],
      {
        DAO_ADDRESS: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
        GOLDSKY_PROJECT_ID: "project_env",
      }
    );
    expect(cfg.goldskyProjectId).toBe("project_x");
  });

  it("throws ConfigError when daoAddress missing", () => {
    expect(() =>
      resolveConfig([], { GOLDSKY_PROJECT_ID: "p" })
    ).toThrowError(ConfigError);
  });

  it("throws ConfigError when goldskyProjectId missing", () => {
    expect(() =>
      resolveConfig([], {
        DAO_ADDRESS: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
      })
    ).toThrowError(ConfigError);
  });

  it("rejects malformed daoAddress", () => {
    expect(() =>
      resolveConfig([], {
        DAO_ADDRESS: "not-an-address",
        GOLDSKY_PROJECT_ID: "p",
      })
    ).toThrowError(ConfigError);
  });

  it("reads BASE_RPC_URL override", () => {
    const cfg = resolveConfig([], {
      DAO_ADDRESS: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
      GOLDSKY_PROJECT_ID: "p",
      BASE_RPC_URL: "https://custom.rpc",
    });
    expect(cfg.rpcUrl).toBe("https://custom.rpc");
  });

  it("omits privateKey when not set", () => {
    const cfg = resolveConfig([], {
      DAO_ADDRESS: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
      GOLDSKY_PROJECT_ID: "p",
    });
    expect(cfg.privateKey).toBeUndefined();
  });

  it("includes privateKey when env set", () => {
    const cfg = resolveConfig([], {
      DAO_ADDRESS: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
      GOLDSKY_PROJECT_ID: "p",
      PRIVATE_KEY: "0x" + "1".repeat(64),
    });
    expect(cfg.privateKey).toBe("0x" + "1".repeat(64));
  });

  it("rejects invalid PRIVATE_KEY format", () => {
    expect(() =>
      resolveConfig([], {
        DAO_ADDRESS: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
        GOLDSKY_PROJECT_ID: "p",
        PRIVATE_KEY: "not-valid-hex",
      })
    ).toThrowError(ConfigError);
  });

  it("rejects invalid CHAIN_ID", () => {
    expect(() =>
      resolveConfig([], {
        DAO_ADDRESS: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
        GOLDSKY_PROJECT_ID: "p",
        CHAIN_ID: "not-a-number",
      })
    ).toThrowError(ConfigError);
  });
});
