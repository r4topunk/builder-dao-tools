# builder-dao-tools

> A CLI and MCP server for any Nouns Builder DAO on Base — one binary for governance reads, on-chain voting, and AI agent integration.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220)](pnpm-workspace.yaml)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](.nvmrc)
[![Base](https://img.shields.io/badge/chain-Base-0052FF)](https://base.org)

Works with any Nouns Builder DAO — point it at a token contract and a Goldsky project ID, get proposals, votes, ENS resolution, and on-chain vote casting. The same tools also expose as an MCP server so Claude/Cursor/Copilot/etc. can operate on your DAO's governance data via native tool calls.

Originally extracted from [gnars-website](https://github.com/r4topunk/gnars-website), generalized for the whole Builder ecosystem.

---

## Why

Every Nouns Builder DAO on Base needs the same things: list proposals, look up a specific one, inspect votes, resolve voter ENS, occasionally cast a vote, and expose this data to the AI tooling their contributors already use. But every DAO today ends up writing its own scripts.

This package gives you:

- **One binary, configured by DAO address.** No multi-DAO fork-per-DAO. Switch DAOs with `--dao 0x…`.
- **CLI + MCP unified.** The same tools back both surfaces. No drift between the two.
- **A plugin registry.** Add DAO-specific commands (treasury analysis, custom feeds, your own voting strategies) as small addon packages — no fork needed.
- **Nothing hardcoded.** Governor, treasury, and auction addresses resolve from the subgraph at runtime. Chain is Base, token contract is your knob.

---

## Contents

- [Install](#install)
- [Quickstart](#quickstart)
- [How it works](#how-it-works)
- [CLI reference](#cli-reference)
- [MCP server](#mcp-server)
- [Plugin system](#plugin-system)
- [Monorepo layout](#monorepo-layout)
- [Development](#development)
- [Roadmap](#roadmap)
- [Acknowledgments](#acknowledgments)
- [License](#license)

---

## Install

> **Status:** The npm publish of `@builder-dao/*` is pending coordination with the Builder DAO team. In the meantime, clone and build locally — see [Development](#development).

Once published:

```bash
# Core (CLI + MCP server) — required
pnpm add -g @builder-dao/cli

# Optional addon: local cache + semantic search over proposal text
pnpm add -g @builder-dao/cli-search
```

Point it at your DAO:

```bash
export DAO_ADDRESS=0x...                # your Builder DAO token contract
export GOLDSKY_PROJECT_ID=...           # Goldsky project that hosts the Nouns Builder Base subgraph
```

Or per-invocation with flags: `builder-dao --dao 0x… --subgraph-project project_… proposals`.

See [examples/gnars.env](examples/gnars.env) for a working Gnars config.

---

## Quickstart

Three canonical invocations.

**1. List recent proposals**

```bash
$ builder-dao proposals --limit 3 --pretty
{
  "proposals": [
    {
      "proposalNumber": 119,
      "title": "Pod Media Strategy - Q1 2026",
      "status": "EXECUTED",
      "proposer": "0x…",
      "forVotes": 42,
      "againstVotes": 0,
      …
    },
    …
  ],
  "total": 3,
  "hasMore": true
}
```

**2. Drill into a specific proposal**

```bash
$ builder-dao proposal 1 --pretty
{
  "proposalId": "0x504535cf2538b2f631a86d5bbe3e03608f71700a2a576e7f57b10d5e526a3645",
  "proposalNumber": 1,
  "title": "Bruno Piu - Onboarding",
  "status": "EXECUTED",
  "description": "…",
  "result": "PASSING"
}
```

**3. Launch the MCP server for Claude / Cursor / any MCP client**

```bash
$ builder-dao mcp
# stdio MCP server, ready to accept tool calls
```

Or HTTP/SSE for browser-based clients:

```bash
$ builder-dao mcp --sse          # http://localhost:3100/mcp  (health at /health)
```

---

## How it works

```
   ┌───────────────────────────┐       ┌────────────────────────┐
   │  Claude / Cursor / IDE    │       │  Terminal / scripts    │
   │  (MCP client)             │       │  (CLI user)            │
   └────────────┬──────────────┘       └───────────┬────────────┘
                │ MCP protocol (stdio or HTTP)     │ argv
                ▼                                  ▼
          ┌─────────────────────────────────────────────────┐
          │           builder-dao binary                     │
          │                                                  │
          │  ┌───────────────────────────────────────────┐  │
          │  │        Plugin registry                    │  │
          │  │                                           │  │
          │  │  core commands  ──┐                       │  │
          │  │  core MCP tools ──┤   ← addons register   │  │
          │  │  addon commands ──┤     here at startup   │  │
          │  │  addon MCP tools ─┘                       │  │
          │  └───────────────────────────────────────────┘  │
          │                        │                         │
          │          RunContext (DaoConfig + SubgraphClient) │
          └─────────────────────────┬───────────────────────┘
                                    ▼
              ┌─────────────────────┴────────────────────┐
              ▼                                          ▼
    ┌──────────────────────┐                  ┌────────────────────┐
    │ Goldsky subgraph      │                  │ viem → Base RPC    │
    │ (Nouns Builder,       │                  │ (writes: cast_vote)│
    │  Base mainnet)        │                  │                    │
    └──────────────────────┘                  └────────────────────┘
```

- **Same code, two surfaces.** The 8 tools (list_proposals, get_proposal, get_proposal_votes, resolve_ens, resolve_ens_batch, cast_vote, sync_proposals, search_proposals, index_embeddings) register once, expose via both the CLI command layer and the MCP tool layer.
- **Stateless by default.** Read-path commands hit the subgraph directly — no database needed.
- **Optional local cache.** Install `@builder-dao/cli-search` and your data is synced to `$XDG_DATA_HOME/builder-dao/<dao-addr>.db` for offline + semantic search over proposal text via a local HuggingFace embedding model.
- **Per-DAO isolation.** Switch DAOs with `--dao 0x…` and the SQLite path switches automatically. No shared state between DAOs.

More detail in [`docs/architecture.md`](docs/architecture.md).

---

## CLI reference

See [`packages/core/README.md`](packages/core/README.md) for the full reference. Summary:

| Command | Package | What it does |
|---------|---------|--------------|
| `builder-dao proposals` | core | List proposals, filter by status |
| `builder-dao proposal <id>` | core | Single proposal detail |
| `builder-dao votes <id>` | core | Votes on a proposal |
| `builder-dao vote <id> FOR\|AGAINST\|ABSTAIN` | core | On-chain vote (requires `PRIVATE_KEY`) |
| `builder-dao ens <addr>…` | core | Resolve ENS + avatar for one or more addresses |
| `builder-dao mcp [--sse]` | core | Launch the MCP server |
| `builder-dao sync` | search addon | Sync proposals to local SQLite |
| `builder-dao index` | search addon | Generate embeddings |
| `builder-dao search "<query>"` | search addon | Semantic search |

**Global flags:** `--dao <addr>`, `--subgraph-project <id>`, `--rpc-url <url>`, `--pretty`, `--toon` (40% fewer tokens for LLM context), `--help`, `--version`.

---

## MCP server

`builder-dao mcp` serves all tools over MCP stdio. Example Claude Desktop config:

```json
{
  "mcpServers": {
    "builder-dao": {
      "command": "builder-dao",
      "args": ["mcp"],
      "env": {
        "DAO_ADDRESS": "0x...",
        "GOLDSKY_PROJECT_ID": "..."
      }
    }
  }
}
```

For HTTP-capable clients: `builder-dao mcp --sse` exposes the server at `http://localhost:3100/mcp`. Port configurable via `MCP_PORT`. Health check at `/health`.

More client snippets in [`examples/`](examples/).

---

## Plugin system

Any npm package can add commands and MCP tools to the `builder-dao` binary by importing the core registry and calling `registerCommand` / `registerTool`. At startup, the core CLI dynamically imports `@builder-dao/cli-<addon-name>` packages, and their registrations become first-class commands.

Minimum addon:

```ts
// my-addon/src/index.ts
import { registerCommand } from "@builder-dao/cli";

registerCommand({
  name: "holders",
  description: "List current token holders",
  usage: "holders [--limit N]",
  async run(args, ctx) {
    // ctx.config.daoAddress, ctx.subgraph.fetchProposals(…), ctx.print(data)
    const holders = await fetchHolders(ctx.config.daoAddress);
    ctx.print(holders);
  },
});
```

Full guide: [`docs/plugin-api.md`](docs/plugin-api.md).

---

## Monorepo layout

```
builder-dao-tools/
├── packages/
│   ├── core/                 # @builder-dao/cli  (CLI + MCP server + plugin registry)
│   │   ├── src/
│   │   │   ├── cli.ts        # binary entry — builder-dao
│   │   │   ├── server.ts     # MCP server (stdio + SSE)
│   │   │   ├── registry.ts   # plugin registry
│   │   │   ├── context.ts    # RunContext factory
│   │   │   ├── config.ts     # DaoConfig resolver
│   │   │   ├── subgraph/     # Goldsky client, queries, DAO metadata lookup
│   │   │   ├── tools/        # list / get / votes / vote / ens
│   │   │   └── utils/
│   │   └── tests/            # 58 tests
│   └── search/               # @builder-dao/cli-search  (optional addon)
│       ├── src/
│       │   ├── index.ts      # side-effect registration
│       │   ├── db/           # per-DAO SQLite (better-sqlite3)
│       │   ├── embeddings/   # HuggingFace Transformers (all-MiniLM-L6-v2)
│       │   └── tools/        # sync / index / search
│       └── tests/            # 37 tests
├── docs/                     # architecture, plugin-api, migration guide
├── examples/                 # .env + MCP client configs
└── .github/workflows/        # CI + release (changesets-driven)
```

Zero Gnars-specific defaults anywhere in `packages/` — CI enforces this.

---

## Development

Prereqs: Node ≥ 20, pnpm 9.

```bash
git clone https://github.com/r4topunk/builder-dao-tools.git
cd builder-dao-tools
pnpm install
pnpm -r build            # build both packages
pnpm -r test:run         # 95 tests total (58 core + 37 search)
pnpm -r typecheck        # strict TS across the monorepo
```

Run the CLI against your DAO without installing globally:

```bash
DAO_ADDRESS=0x... GOLDSKY_PROJECT_ID=... \
  node packages/core/dist/cli.js proposals --limit 3 --pretty
```

Watch mode for iterative development:

```bash
pnpm --filter @builder-dao/cli dev -- proposals --limit 3 --pretty
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the release flow (@changesets) and coding conventions.

---

## Roadmap

- [x] Core CLI + MCP server
- [x] Plugin registry (CLI commands + MCP tools)
- [x] Per-DAO SQLite isolation for semantic search
- [x] Dynamic governor resolution via subgraph
- [x] TOON output for token-efficient LLM context
- [x] GitHub Actions CI (lint, typecheck, test, build, no-Gnars-defaults guard)
- [ ] Publish to npm under `@builder-dao/*`
- [ ] Transfer repo to the Builder DAO GitHub org
- [ ] Additional addons (treasury analysis, governance alerts)
- [ ] Multi-chain support (when Builder ships on non-Base chains)

---

## Acknowledgments

- The **Nouns Builder** team for the original subgraph and contract design.
- **Gnars DAO** for funding the original `mcp-subgraph` prototype that this package was extracted from.
- **Goldsky** for hosting the Nouns Builder subgraph on Base.
- The **Model Context Protocol** team at Anthropic for making agent ↔ tool integration boring.

---

## License

[MIT](LICENSE) © 2026 builder-dao-tools contributors.
