# Architecture of builder-dao-tools

A modular, pluggable CLI and MCP server for Nouns Builder DAOs on Base.

## High-Level Overview

```
┌────────────────────────────────┐
│  Claude / MCP Client           │
│  (Claude Desktop, Cursor, etc) │
└──────────────┬─────────────────┘
               │ MCP Protocol (stdio/HTTP)
               ▼
┌────────────────────────────────────────┐
│   @builder-dao/cli MCP Server          │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Plugin Registry                 │  │
│  │  ├─ Core Commands                │  │
│  │  │  ├ proposals                  │  │
│  │  │  ├ proposal                   │  │
│  │  │  ├ votes                      │  │
│  │  │  ├ vote                       │  │
│  │  │  └ ens                        │  │
│  │  │                               │  │
│  │  └─ Addon Commands (optional)    │  │
│  │     ├ sync                       │  │
│  │     ├ index                      │  │
│  │     └ search                     │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  RunContext                      │  │
│  │  ├─ config: DaoConfig            │  │
│  │  ├─ subgraph: SubgraphClient    │  │
│  │  ├─ format: OutputFormat         │  │
│  │  ├─ pretty: boolean              │  │
│  │  └─ print(): void                │  │
│  └──────────────────────────────────┘  │
│                                         │
└──────────┬──────────────────────────────┘
           │
       ┌───┴────────────┬─────────────────┐
       ▼                ▼                  ▼
  ┌─────────┐     ┌──────────────┐   ┌──────────────┐
  │ Goldsky │     │ Per-DAO DB   │   │  Embeddings  │
  │Subgraph │     │  (SQLite)    │   │  (HF Models) │
  │ (GQL)   │     │              │   │              │
  └─────────┘     └──────────────┘   └──────────────┘
```

## Packages

| Package | Exports | Purpose | Dependencies |
|---------|---------|---------|--------------|
| `@builder-dao/cli` (core) | CLI binary `builder-dao`, MCP server, registry API (`registerCommand`, `registerTool`, `getCommands`, `getTools`), types (`RunContext`, `DaoConfig`) | Read-only governance queries: proposals, votes, ENS; MCP server launcher | @modelcontextprotocol/sdk, zod, viem |
| `@builder-dao/cli-search` (addon) | Commands: `sync`, `index`, `search`; MCP tools: `sync_proposals`, `index_embeddings`, `search_proposals` | Optional semantic search and caching. Zero dependencies imported into core. | @xenova/transformers, better-sqlite3, peerDep: @builder-dao/cli |

## Configuration Resolution

The CLI uses a precedence model for all config values:

1. **CLI flags** — highest priority. E.g., `--dao 0x... --subgraph-project id`.
2. **Environment variables** — if flag not provided. E.g., `DAO_ADDRESS`, `GOLDSKY_PROJECT_ID`.
3. **Error** — if required value (`daoAddress`, `goldskyProjectId`) is still missing.

All resolved config values produce a `DaoConfig` object:

```typescript
interface DaoConfig {
  daoAddress: `0x${string}`;        // Required
  goldskyProjectId: string;          // Required
  chainId: number;                   // Default: 8453 (Base)
  rpcUrl: string;                    // Default: https://mainnet.base.org
  privateKey?: `0x${string}`;        // Optional; only for vote
}
```

See `packages/core/README.md` for full env and flag reference.

## Plugin Registry

A singleton in-memory registry allows the core package to remain lightweight while optional addons register commands and MCP tools at startup.

**Registration (addon side):**

```typescript
// packages/search/src/index.ts (side-effect only)
import { registerCommand, registerTool } from "@builder-dao/cli";

registerCommand({
  name: "sync",
  description: "Sync proposals from subgraph to local DB",
  usage: "sync [--full]",
  async run(args, ctx) { /* ... */ },
});

registerTool({
  name: "sync_proposals",
  description: "...",
  inputSchema: syncProposalsSchema,
  handler: async (input, ctx) => { /* ... */ },
});
```

**Discovery (core side):**

Both the CLI and MCP server execute the same dynamic import at startup:

```typescript
try {
  await import("@builder-dao/cli-search");
} catch {
  // Addon not installed; core commands remain available
}
```

If the addon is installed (peerDep resolution succeeds), its side-effect registration runs and its commands/tools appear in the registry. If not installed, the core gracefully continues with only core commands.

**Unknown command UX:**

If a user runs `builder-dao search` without installing the addon, the CLI detects the missing command and prints:

```
Command 'search' not found.
To use semantic search, install: pnpm add -g @builder-dao/cli-search
```

## Data Flow: Core Commands

### Read Path (proposals, proposal, votes)

```
User/MCP Client
  ↓
  cli.ts or server.ts
  ↓
  resolve config (argv + env)
  ↓
  createContext (DaoConfig) → SubgraphClient
  ↓
  getCommand / getTool from registry
  ↓
  tool.run / tool.handler
  ↓
  SubgraphClient → Goldsky GraphQL query
  ↓
  Parse & format response
  ↓
  ctx.print() [CLI] OR return JSON [MCP]
```

**Example: `builder-dao proposals --status ACTIVE`**

1. Parse CLI args → `{ status: "ACTIVE" }`
2. Resolve config from env/flags
3. Create context with subgraph client
4. Call `proposals` tool
5. Subgraph client executes GraphQL query on `https://api.goldsky.com/api/public/{projectId}/subgraphs/nouns-builder-base-mainnet/latest/gn`
6. Filter by status in response
7. `ctx.print()` outputs JSON

### Write Path (vote)

```
User + PRIVATE_KEY env
  ↓
  resolve config (includes privateKey)
  ↓
  createContext + createWalletClient (viem)
  ↓
  vote tool.run / tool.handler
  ↓
  subgraph.fetchDaoMetadata (resolve governor address)
  ↓
  viem walletClient.writeContract (governor.castVote)
  ↓
  await confirmations
  ↓
  return receipt or tx hash
  ↓
  ctx.print() [CLI] OR return result [MCP]
```

**Safety:**
- Governor address is **not hardcoded**; it's resolved at runtime from the subgraph (one query per DAO).
- Private key is read **from environment only**, never CLI arg.

### Addon Path (sync / index / search)

```
User
  ↓
  resolver config
  ↓
  openDatabase(config) → SQLite connection keyed by daoAddress
  ↓
  [sync] subgraph.fetchAll() → repo.insertOrUpdate()
  ↓
  [index] repo.getUnembeddedProposals() → embeddings.generate() → repo.upsertEmbeddings()
  ↓
  [search] embeddings.generateQuery() → repo.searchSimilar() → format & print
```

All addon reads/writes go through `ProposalRepository`, which abstracts SQLite schema details.

## Subgraph Endpoint

The Nouns Builder subgraph on Base is hosted at Goldsky:

```
https://api.goldsky.com/api/public/{GOLDSKY_PROJECT_ID}/subgraphs/nouns-builder-base-mainnet/latest/gn
```

Queries:
- **Proposals** — `query { proposals(where: { status: "ACTIVE" }, first: 20, orderBy: "proposalNumber", orderDirection: "desc") { id, number, title, ... } }`
- **Proposal detail** — by ID or number
- **Votes** — by proposal ID, with optional status filter
- **DAO metadata** — for governor and token addresses

The subgraph is read-only; voting writes happen on-chain via the governor contract.

## Per-DAO State: Database Location

The search addon stores one SQLite database per DAO address:

```
$XDG_DATA_HOME/builder-dao/{daoAddressShort}.db
```

Where `daoAddressShort` is the first 10 characters of the address, e.g., `0x880fb3cf.db` for Gnars.

On macOS: `~/.local/share/builder-dao/0x880fb3cf.db`  
On Linux: `~/.local/share/builder-dao/0x880fb3cf.db`  
On Windows: `%LOCALAPPDATA%\builder-dao\0x880fb3cf.db`

**Transparent switching:** When a user runs `--dao <new-address>`, the addon automatically opens the database for that DAO. No migration needed; each DAO has its own isolated database.

## Shared Layer: RunContext

All commands and tools receive a `RunContext` instance that provides:

- **`config`** — the resolved `DaoConfig`
- **`subgraph`** — a `SubgraphClient` for GraphQL queries
- **`format`** — output format (`"json"` or `"toon"`)
- **`pretty`** — pretty-print flag
- **`print(data)`** — outputs data according to format (CLI use only; MCP tools return instead)

This allows tools to remain format-agnostic and enables addons to access the same context without reimplementing query logic.

## Command vs. Tool Lifecycle

| Aspect | CLI Command | MCP Tool |
|--------|-------------|----------|
| **Entry** | `cli.ts` parses args, calls `run(args, ctx)` | `server.ts` deserializes JSON input, calls `handler(input, ctx)` |
| **Output** | Calls `ctx.print(data)` (writes to stdout) | Returns data (server serializes to JSON response) |
| **Schema** | Via parseArgs() (string args) | Via Zod schema (structured input) |
| **Context** | Same `RunContext` | Same `RunContext` |

Both entry points share the same registry and command/tool instances.

## Deployment Model

**Single binary, dual interface:**

- `builder-dao` (CLI) — runs commands, reads/writes files, prints to stdout
- `builder-dao mcp` — launches MCP server (stdio mode default, HTTP/SSE optional)

Both are packaged in the same `@builder-dao/cli` distribution; no separate server process.

**Addon distribution:**

The `@builder-dao/cli-search` package is published separately. At runtime, the core attempts `await import("@builder-dao/cli-search")`. If the package is installed, its side-effect registration runs; if not, core continues. This allows users to opt-in to the size+performance cost of embeddings and SQLite.

## Key Design Principles

1. **DAO-agnostic** — No Gnars defaults or hardcodes. All DAO context comes from config at runtime.
2. **Modular** — Core is stateless and dependency-light; addons inject features via the registry without modifying core.
3. **Transparent database isolation** — Each DAO has its own DB; switching via `--dao` is automatic and implicit.
4. **CLI + MCP parity** — Same registry, same context, same tool logic; only output differs.
5. **Fail-safe addon loading** — Core continues if addon is missing; user gets a helpful message when attempting an addon command.
