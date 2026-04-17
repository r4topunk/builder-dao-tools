# Plugin API Guide

Write your own addon for `@builder-dao/cli`.

## Overview

The `@builder-dao/cli` core exposes a plugin registry that allows published npm packages (addon packages) to register their own CLI commands and MCP tools without modifying the core package. This guide shows you how to create an addon.

## Package Setup

Create a new npm package with the following structure:

**package.json:**

```json
{
  "name": "@builder-dao/cli-myfeature",
  "version": "0.1.0",
  "description": "My feature addon for @builder-dao/cli",
  "type": "module",
  "main": "dist/index.js",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "peerDependencies": {
    "@builder-dao/cli": "^0.1.0"
  },
  "devDependencies": {
    "@builder-dao/cli": "^0.1.0",
    "typescript": "^5.5.0",
    "zod": "^3.23.0"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

Key notes:
- **No `bin`** — the addon does not provide a binary; the core binary discovers and loads it.
- **`exports`** — point to your compiled entry file.
- **`peerDependencies`** — require `@builder-dao/cli` as a peer; users must install both.
- **Avoid heavy dependencies** — the core package should remain lightweight; add only what your addon needs.

## Entry File: Side-Effect Registration

The entry point (`src/index.ts`) uses side-effects (module-level code) to register commands and tools into the core registry. This file is imported automatically by the core at startup.

```typescript
// src/index.ts
import { parseArgs } from "node:util";
import { z } from "zod";
import { registerCommand, registerTool } from "@builder-dao/cli";

// CLI Command Registration
registerCommand({
  name: "hello",
  description: "Print a friendly hello with DAO info",
  usage: "hello [--name NAME]",
  async run(args, ctx) {
    const { values } = parseArgs({
      args,
      options: { name: { type: "string" } },
    });
    const name = values.name ?? "world";
    ctx.print({
      greeting: `Hello, ${name}!`,
      dao: ctx.config.daoAddress,
    });
  },
});

// MCP Tool Registration
const helloInputSchema = z.object({
  name: z.string().default("world").describe("Person to greet"),
  verbose: z.boolean().optional().describe("Include DAO address in response"),
});

registerTool({
  name: "hello",
  description: "Greet a name",
  inputSchema: helloInputSchema,
  handler: async (input, ctx) => {
    const parsed = helloInputSchema.parse(input);
    const greeting = `Hello, ${parsed.name}!`;
    const response: any = { greeting };
    if (parsed.verbose) {
      response.dao = ctx.config.daoAddress;
    }
    return response;
  },
});
```

Both are optional; your addon can have just commands, just tools, or both.

## RunContext

Every command and tool receives a `RunContext` with five fields:

```typescript
interface RunContext {
  config: DaoConfig;           // Resolved DAO config
  subgraph: SubgraphClient;    // Goldsky client for queries
  format: OutputFormat;        // "json" or "toon"
  pretty: boolean;             // Pretty-print flag
  print(data: unknown): void;  // Output function (CLI only)
}

interface DaoConfig {
  daoAddress: `0x${string}`;
  goldskyProjectId: string;
  chainId: number;
  rpcUrl: string;
  privateKey?: `0x${string}`;
}
```

**CLI commands** call `ctx.print()` to output data. **MCP tools** return data directly; the MCP server serializes the return value to JSON.

## CLI Commands

A CLI command has a name, description, usage string, and async `run` function:

```typescript
import { registerCommand } from "@builder-dao/cli";

registerCommand({
  name: "my-command",
  description: "Do something useful",
  usage: "my-command <arg> [--flag VALUE]",
  async run(args: string[], ctx: RunContext): Promise<void> {
    // args: remaining CLI args after command name (e.g., ["--flag", "value"])
    // ctx: RunContext

    // Parse flags using parseArgs
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        flag: { type: "string" },
        count: { type: "string", default: "1" },
      },
    });

    // Use context
    const result = await ctx.subgraph.fetchProposals(/* ... */);

    // Output
    ctx.print({
      message: "Success",
      data: result,
      dao: ctx.config.daoAddress,
    });
  },
});
```

## MCP Tools

An MCP tool has a name, description, input schema (Zod), and async handler:

```typescript
import { z } from "zod";
import { registerTool } from "@builder-dao/cli";

const myToolSchema = z.object({
  proposalId: z
    .union([z.string(), z.number()])
    .describe("Proposal ID or number"),
  includeVotes: z
    .boolean()
    .optional()
    .describe("Include voting breakdown"),
});

registerTool({
  name: "my_tool",
  description: "Fetch and analyze a proposal",
  inputSchema: myToolSchema,
  handler: async (input: unknown, ctx: RunContext): Promise<unknown> => {
    // input: parsed and validated by Zod schema before calling handler
    const parsed = myToolSchema.parse(input);

    // Use subgraph
    const proposal = await ctx.subgraph.fetchProposal(parsed.proposalId);

    // Return data (MCP server serializes to JSON)
    return {
      proposal,
      analysis: {
        isActive: proposal.status === "ACTIVE",
        participationRate: computeRate(proposal),
      },
    };
  },
});
```

**Input Validation:**
- The MCP server validates input against your schema before calling `handler`.
- If validation fails, the server returns an error to the client; your handler is not called.
- Inside `handler`, you can safely assume the input matches your schema.

## Testing

Test your addon in isolation using `resetRegistry()` from the core:

```typescript
// tests/my-command.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetRegistry, getCommands } from "@builder-dao/cli";
import { DaoConfig } from "@builder-dao/cli";
import "../index"; // Import addon to trigger registration

describe("my-command", () => {
  beforeEach(() => {
    resetRegistry(); // Clear any previous test state
    // Re-import addon to re-register for this test
    void import("../index");
  });

  it("should register the command", () => {
    const commands = getCommands();
    const cmd = commands.find((c) => c.name === "my-command");
    expect(cmd).toBeDefined();
    expect(cmd?.description).toContain("useful");
  });

  it("should execute and output", async () => {
    const config: DaoConfig = {
      daoAddress: "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
      goldskyProjectId: "test_project",
      chainId: 8453,
      rpcUrl: "https://mainnet.base.org",
    };

    let output: unknown;
    const ctx = {
      config,
      subgraph: mockSubgraphClient(),
      format: "json" as const,
      pretty: false,
      print(data: unknown) {
        output = data;
      },
    };

    const cmd = getCommands().find((c) => c.name === "my-command")!;
    await cmd.run(["--flag", "value"], ctx);

    expect(output).toMatchObject({ message: "Success" });
  });
});
```

## Publishing

**Naming convention:**

- Scoped: `@builder-dao/cli-<your-feature>`
- Examples: `@builder-dao/cli-twitter-search`, `@builder-dao/cli-gnars-treasury`

If the `@builder-dao` scope is unavailable, use:
- `@buildersdk/cli-<your-feature>`
- Or unscoped: `builder-dao-cli-<your-feature>`

**Installation:**

Users install alongside the core:

```bash
pnpm add -g @builder-dao/cli @builder-dao/cli-myfeature
```

Or locally in a project:

```bash
pnpm add @builder-dao/cli @builder-dao/cli-myfeature
```

**Discovery:**

The core package auto-detects and loads your addon at runtime:

```typescript
try {
  await import("@builder-dao/cli-search");
} catch {
  // Not installed; continue
}
```

No configuration or plugin manifest needed. If your package is installed and reachable, the dynamic import succeeds and your side-effects run.

## Best Practices

1. **Keep schema simple** — use Zod to document expected input clearly.
2. **Return structured data** — avoid unstructured text; MCP clients parse JSON and tools need schema.
3. **Use `ctx` not side effects** — access config and subgraph through RunContext, not global state.
4. **Error handling** — throw descriptive errors; the MCP server and CLI will catch and format them.
5. **Idempotency** — operations that modify state (DB writes) should be safe to retry.
6. **Documentation** — provide a README with command/tool examples and required setup.

## Example: A Complete Addon

Here's a minimal addon that adds a `stats` command:

**src/index.ts:**
```typescript
import { registerCommand } from "@builder-dao/cli";

registerCommand({
  name: "stats",
  description: "Show proposal statistics for the DAO",
  usage: "stats",
  async run(_args, ctx) {
    const proposals = await ctx.subgraph.fetchProposals({});
    const stats = {
      totalProposals: proposals.length,
      active: proposals.filter((p) => p.status === "ACTIVE").length,
      executed: proposals.filter((p) => p.status === "EXECUTED").length,
      dao: ctx.config.daoAddress,
    };
    ctx.print(stats);
  },
});
```

**package.json:**
```json
{
  "name": "@builder-dao/cli-stats",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "peerDependencies": { "@builder-dao/cli": "^0.1.0" },
  "devDependencies": { "@builder-dao/cli": "^0.1.0", "typescript": "^5.5.0" }
}
```

**Usage:**
```bash
pnpm add -g @builder-dao/cli @builder-dao/cli-stats
builder-dao stats --pretty
# { "totalProposals": 42, "active": 2, "executed": 40, "dao": "0x..." }
```

## Troubleshooting

**Command not found:**
- Ensure your addon package is installed (`npm list @builder-dao/cli-yourpkg`).
- Check that `@builder-dao/cli` is also installed and accessible.
- Verify the command name matches the `name` field in `registerCommand()`.

**Schema validation fails:**
- Review your Zod schema; make sure field types and defaults match expected inputs.
- Test the schema independently: `schema.parse(yourInput)`.

**Import errors:**
- Check that `peerDependencies` are installed.
- Ensure your addon's TypeScript builds without errors.

## Further Reading

- See `packages/search/src/index.ts` in the repository for a production addon example.
- See the main `packages/core/README.md` for CLI usage and MCP client setup.
