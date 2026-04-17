#!/usr/bin/env node
import { resolveConfig, ConfigError } from "./config.js";
import { createContext } from "./context.js";
import { registerCoreCommands } from "./tools/register-core.js";
import { getCommand, getCommands } from "./registry.js";

function stripFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) continue;
    if (a === "--pretty" || a === "--toon" || a === "--help" || a === "-h" || a === "--version") {
      continue;
    }
    if (a === "--dao" || a === "--subgraph-project" || a === "--rpc-url") {
      i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

function printHelp(): void {
  const cmds = getCommands();
  const cmdLines = cmds.map((c) => `  ${c.usage.padEnd(60)} ${c.description}`).join("\n");
  console.error(`
builder-dao - CLI for Nouns Builder DAOs on Base

Usage: builder-dao <command> [args] [flags]

Global flags:
  --dao <addr>               DAO token address (overrides DAO_ADDRESS env)
  --subgraph-project <id>    Goldsky project ID (overrides GOLDSKY_PROJECT_ID env)
  --rpc-url <url>            RPC URL (overrides BASE_RPC_URL env)
  --pretty                   Pretty-print JSON output
  --toon                     Output TOON (~40% fewer tokens)
  --help, -h                 Show this help
  --version                  Print version

Commands:
${cmdLines}

Environment:
  DAO_ADDRESS                Required unless --dao passed
  GOLDSKY_PROJECT_ID         Required unless --subgraph-project passed
  BASE_RPC_URL               Default https://mainnet.base.org
  PRIVATE_KEY                Required only for \`vote\`
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  registerCoreCommands();
  try {
    // @ts-expect-error - addon not yet available
    await import("@builder-dao/cli-search");
  } catch {
    // Addon not installed — continue with core commands only
  }

  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  if (argv.includes("--version")) {
    const pkg = await import("../package.json", { with: { type: "json" } });
    console.log(pkg.default.version);
    process.exit(0);
  }

  const commandName = argv[0];
  if (!commandName) {
    printHelp();
    process.exit(1);
  }

  if (commandName === "mcp") {
    const { runServer } = await import("./server.js");
    await runServer();
    return;
  }

  const command = getCommand(commandName);
  if (!command) {
    console.error(`Unknown command: ${commandName}`);
    if (["sync", "search", "index"].includes(commandName)) {
      console.error(
        `Command '${commandName}' requires @builder-dao/cli-search.\n` +
          `Install: pnpm add -g @builder-dao/cli-search`
      );
    } else {
      printHelp();
    }
    process.exit(1);
  }

  try {
    const config = resolveConfig(argv, process.env);
    const ctx = createContext(config, {
      format: argv.includes("--toon") ? "toon" : "json",
      pretty: argv.includes("--pretty"),
    });
    const rest = stripFlags(argv.slice(1));
    if (command) {
      await command.run(rest, ctx);
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Config error: ${err.message}`);
      process.exit(2);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
