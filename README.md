# builder-dao-tools

CLI and MCP server for Nouns Builder DAOs on Base.

- `@builder-dao/cli` — core CLI (`builder-dao`) and MCP server
- `@builder-dao/cli-search` — optional addon: local cache + semantic search

## Quickstart

```bash
pnpm add -g @builder-dao/cli
export DAO_ADDRESS=0x...           # DAO token contract
export GOLDSKY_PROJECT_ID=...       # Goldsky project ID for Builder Base subgraph
builder-dao proposals --limit 5 --pretty
```

## Commands

| Command | Package |
|---------|---------|
| `proposals`, `proposal`, `votes`, `vote`, `ens`, `mcp` | `@builder-dao/cli` |
| `sync`, `index`, `search` | `@builder-dao/cli-search` |

## MCP

Launch the MCP server with `builder-dao mcp` (stdio) or `builder-dao mcp --sse` (HTTP).

See [`packages/core/README.md`](packages/core/README.md) for full reference and [`examples/`](examples/) for client configs.

## Development

```bash
pnpm install
pnpm -r test:run
pnpm -r build
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT.
