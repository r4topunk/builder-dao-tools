import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "../src/server.js";
import { registerCoreCommands } from "../src/tools/register-core.js";
import { resetRegistry } from "../src/registry.js";

const TEST_ENV = {
  DAO_ADDRESS: `0x${"0".repeat(39)}1`,
  GOLDSKY_PROJECT_ID: "project_test",
};

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

describe("createServer", () => {
  beforeEach(() => {
    resetRegistry();
    vi.stubEnv("DAO_ADDRESS", TEST_ENV.DAO_ADDRESS);
    vi.stubEnv("GOLDSKY_PROJECT_ID", TEST_ENV.GOLDSKY_PROJECT_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetRegistry();
  });

  it("does not re-register commands already registered by the caller", async () => {
    registerCoreCommands();
    await expect(createServer()).resolves.toBeDefined();
  });

  it("exposes the registered tools", async () => {
    registerCoreCommands();
    const { server, ctx } = await createServer();
    expect(server).toBeDefined();
    expect(ctx.config.daoAddress).toBe(TEST_ENV.DAO_ADDRESS);
  });

  it("reports the package version, not a hardcoded one", async () => {
    registerCoreCommands();
    const pkg = await import("../package.json", { with: { type: "json" } });
    const { server } = await createServer();
    // The SDK keeps serverInfo on the underlying Server instance
    const info = (server.server as unknown as { _serverInfo: { name: string; version: string } })
      ._serverInfo;
    expect(info.name).toBe("builder-dao");
    expect(info.version).toBe(pkg.default.version);
  });
});

describe.skipIf(!existsSync(CLI_PATH))("builder-dao mcp (stdio integration)", () => {
  let child: ChildProcessWithoutNullStreams | undefined;

  afterEach(() => {
    child?.kill("SIGKILL");
    child = undefined;
  });

  it("starts without a duplicate-registration crash and answers initialize", async () => {
    child = spawn(process.execPath, [CLI_PATH, "mcp"], {
      env: { ...process.env, ...TEST_ENV },
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for initialize response. stderr: ${stderr}`)),
        15_000
      );
      child!.stdout.setEncoding("utf8");
      child!.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as { id?: number };
            if (msg.id === 1) {
              clearTimeout(timer);
              resolve(msg as Record<string, unknown>);
            }
          } catch {
            // Not a complete JSON message yet — keep buffering
          }
        }
      });
      child!.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`mcp exited early with code ${code}. stderr: ${stderr}`));
      });
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "server-test", version: "0.0.0" },
        },
      })}\n`
    );

    const msg = (await response) as {
      result?: { serverInfo?: { name?: string } };
      error?: unknown;
    };

    expect(msg.error).toBeUndefined();
    expect(msg.result?.serverInfo?.name).toBe("builder-dao");
    expect(stderr).not.toMatch(/already registered/);
  }, 20_000);
});
