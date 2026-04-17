# @builder-dao/cli

CLI and MCP server for Nouns Builder DAOs on Base.

## Install

```bash
pnpm add -g @builder-dao/cli
# or
npm i -g @builder-dao/cli
```

To enable semantic search (`sync`, `index`, `search`), also install the optional search addon:

```bash
pnpm add -g @builder-dao/cli-search
```

## Configuration

Set these environment variables or pass them as CLI flags:

| Env Variable | CLI Flag | Required | Description |
|---|---|---|---|
| `DAO_ADDRESS` | `--dao <addr>` | Yes | Token contract address on Base (e.g., `0x880fb3cf...`) |
| `GOLDSKY_PROJECT_ID` | `--subgraph-project <id>` | Yes | Goldsky subgraph project ID |
| `BASE_RPC_URL` | `--rpc-url <url>` | No | Base RPC endpoint; default `https://mainnet.base.org` |
| `CHAIN_ID` | — | No | Blockchain ID; default `8453` (Base) |
| `PRIVATE_KEY` | — | If voting | Only needed for `builder-dao vote` command |

Example:
```bash
export DAO_ADDRESS=0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17
export GOLDSKY_PROJECT_ID=project_cm33ek8kjx6pz010i2c3w8z25
builder-dao proposals
```

Or with CLI flags:
```bash
builder-dao proposals --dao 0x880fb3cf... --subgraph-project project_cm33...
```

## Global Flags

All commands accept:

- `--pretty` — Pretty-print JSON (2-space indent)
- `--toon` — Output TOON format (~40% fewer tokens for LLM use)
- `--help` — Show help
- `--version` — Print version

## Commands

### `proposals`

List all proposals for the DAO with optional filters.

```bash
builder-dao proposals [--status STATUS] [--limit N] [--offset N] [--order asc|desc]
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `--status` | string | — | Filter by proposal status (e.g., `ACTIVE`, `EXECUTED`, `DEFEATED`, `PENDING`, `SUCCEEDED`, `CANCELLED`) |
| `--limit` | number | 20 | Number of proposals to return |
| `--offset` | number | 0 | Pagination offset |
| `--order` | `asc`\|`desc` | `desc` | Sort order by proposal ID |

**Example:**
```bash
builder-dao proposals --status ACTIVE --limit 10 --pretty
```

**Output:** JSON array of proposal objects with `id`, `number`, `title`, `description`, `proposer`, `status`, `forVotes`, `againstVotes`, `abstainVotes`, `createdBlock`, `startBlock`, `endBlock`.

---

### `proposal`

Get a single proposal by its ID or proposal number.

```bash
builder-dao proposal <id>
```

`id` can be a hex proposal ID (`0x...`) or a proposal number (integer).

**Example:**
```bash
builder-dao proposal 42 --pretty
builder-dao proposal 0xabcd1234... --pretty
```

**Output:** A single proposal object with full details, including `targets`, `values`, `signatures`, `calldatas`.

---

### `votes`

List votes on a specific proposal.

```bash
builder-dao votes <id> [--support FOR|AGAINST|ABSTAIN] [--limit N] [--offset N]
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `--support` | `FOR`\|`AGAINST`\|`ABSTAIN` | — | Filter by vote type |
| `--limit` | number | 50 | Number of votes to return |
| `--offset` | number | 0 | Pagination offset |

**Example:**
```bash
builder-dao votes 42 --support FOR --limit 20 --pretty
```

**Output:** JSON array of vote objects with `id`, `proposalId`, `voter`, `support`, `weight`, `reason`.

---

### `vote`

Cast a vote on-chain for an active proposal. **Requires `PRIVATE_KEY` env.**

```bash
builder-dao vote <id> FOR|AGAINST|ABSTAIN [--reason "..."]
```

| Arg | Description |
|---|---|
| `id` | Proposal ID or number |
| `FOR\|AGAINST\|ABSTAIN` | Vote direction |
| `--reason` | Optional text reason (quoted) |

**Example:**
```bash
export PRIVATE_KEY=0x...
builder-dao vote 42 FOR --reason "Strong execution plan" --pretty
```

**Output:** Transaction hash and confirmation details.

---

### `ens`

Resolve one or more Ethereum addresses to ENS names.

```bash
builder-dao ens <addr> [<addr2> ...]
```

**Single address:**
```bash
builder-dao ens 0x1234... --pretty
```

**Multiple addresses:**
```bash
builder-dao ens 0x1234... 0x5678... --pretty
```

**Output:** Object with `displayName`, `name`, `avatar`, `address` per input.

---

### `mcp`

Launch the MCP server for use with Claude Desktop, Cursor, or other MCP clients.

```bash
builder-dao mcp [--sse]
```

**Default (stdio):**
```bash
builder-dao mcp
```
Runs in stdio mode. Use in Claude Desktop or Cursor's MCP config.

**SSE mode (HTTP):**
```bash
builder-dao mcp --sse
```
Launches HTTP server with Server-Sent Events at `http://localhost:3100/mcp`. Override port via `MCP_PORT` env.

Health check:
```bash
curl http://localhost:3100/health
```
Returns: `{ "status": "ok", "mode": "streamable-http", "port": 3100 }`

---

## MCP Tools

When running `builder-dao mcp`, the following tools are exposed to MCP clients:

- **`list_proposals`** — List proposals with status, limit, offset, and order
- **`get_proposal`** — Get a single proposal by ID or number
- **`get_proposal_votes`** — Get votes for a proposal, optionally filtered by support
- **`resolve_ens`** — Resolve a single address to ENS
- **`resolve_ens_batch`** — Resolve multiple addresses to ENS
- **`cast_vote`** — Cast a vote on-chain (requires PRIVATE_KEY)

Tools support `format="toon"` to reduce token usage by ~40% for LLM contexts.

### MCP Client Setup

**Claude Desktop** (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "builder-dao": {
      "command": "builder-dao",
      "args": ["mcp"],
      "env": {
        "DAO_ADDRESS": "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
        "GOLDSKY_PROJECT_ID": "project_cm33ek8kjx6pz010i2c3w8z25"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
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

## Safety

- **`PRIVATE_KEY` is read from environment only** — never pass it as a CLI argument. Never commit it to version control.
- **Prefer ephemeral shells for voting:**
  ```bash
  env PRIVATE_KEY=0x... builder-dao vote 42 FOR
  ```
- **Governor address is resolved at runtime** from the DAO address via the Goldsky subgraph. No hardcoded contract addresses — safe to use with any Nouns Builder DAO on Base.
- **Always validate the proposal ID and DAO address** before casting a vote on-chain.

## License

MIT
