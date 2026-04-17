# @builder-dao/cli-search

Local cache + semantic search addon for `@builder-dao/cli`.

## What it adds

This addon extends the core CLI with proposal caching and semantic search capabilities:

**Commands:**
- `sync` — Pull proposals from subgraph into local SQLite
- `index` — Generate embeddings for cached proposals
- `search` — Semantic search over proposals

**MCP Tools:**
- `sync_proposals`
- `index_embeddings`
- `search_proposals`

## Install

Install alongside the core package (both global or both local):

```bash
pnpm add -g @builder-dao/cli @builder-dao/cli-search
```

Or locally in a project:
```bash
pnpm add @builder-dao/cli @builder-dao/cli-search
```

The core CLI auto-detects and loads this addon — no extra configuration needed.

## Commands

### `sync`

Pull all proposals from the Goldsky subgraph into a local per-DAO SQLite database.

```bash
builder-dao sync [--full]
```

| Flag | Type | Description |
|---|---|---|
| `--full` | boolean | Re-sync all proposals (default: incremental sync only new/updated) |

**Example:**
```bash
# First sync (downloads all proposals)
builder-dao sync --pretty

# Later, incremental sync (only new proposals)
builder-dao sync --pretty

# Force full re-index
builder-dao sync --full --pretty
```

**Output:** JSON object with `synced`, `inserted`, `updated`, `deleted`, `durationMs`.

---

### `index`

Generate embeddings for synced proposals. Idempotent — only new proposals get embeddings.

```bash
builder-dao index
```

Uses the `all-MiniLM-L6-v2` model (384-dimensional embeddings) via Hugging Face Transformers, running locally.

**Example:**
```bash
builder-dao index --pretty
```

**Output:** JSON object with `indexed`, `skipped`, `totalProposals`, `embeddedCount`, `durationMs`.

**First-run note:** The embedding model (~25 MB) downloads on first use. Indexing performance is roughly 100 proposals per minute on modern laptops.

---

### `search`

Semantic search over synced, indexed proposals.

```bash
builder-dao search "<query>" [--status STATUS] [--limit N] [--threshold 0-1]
```

| Arg | Type | Default | Description |
|---|---|---|---|
| `query` | string | — | Search text (quoted) |
| `--status` | string | — | Filter by proposal status (e.g., `ACTIVE`) |
| `--limit` | number | 5 | Maximum results |
| `--threshold` | number | 0.3 | Cosine similarity threshold (0.0–1.0); lower = more results |

**Requirements:** Must run `sync` and `index` first.

**Example:**
```bash
builder-dao search "skateboarding event" --limit 10 --pretty
builder-dao search "treasury management" --status EXECUTED --threshold 0.5 --pretty
```

**Output:** JSON array of proposals ranked by similarity score (`similarity` field).

---

## Database

### Location

The addon stores proposals in a SQLite database per DAO:

```
$XDG_DATA_HOME/builder-dao/{dao-addr-short}.db
```

On macOS: `~/.local/share/builder-dao/{dao-addr-short}.db`
On Linux: `~/.local/share/builder-dao/{dao-addr-short}.db`
On Windows: `%LOCALAPPDATA%/builder-dao/{dao-addr-short}.db`

Example for Gnars (`0x880fb3cf...`):
```
~/.local/share/builder-dao/0x880fb3cf.db
```

### Switching DAOs

When you use `--dao` to switch DAOs, the addon automatically switches to the corresponding database:

```bash
builder-dao sync --dao 0x880fb3cf... # Uses 0x880fb3cf.db
builder-dao sync --dao 0xaabbccdd... # Uses 0xaabbccdd.db
```

### Override Database Path

Set `DB_PATH` env to use a custom location:

```bash
export DB_PATH=/tmp/my-proposals.db
builder-dao sync
```

## Embeddings

### Model

Uses `all-MiniLM-L6-v2` from Hugging Face — a lightweight (25 MB), production-proven model outputting 384-dimensional vectors.

### Local Inference

All embeddings are generated locally; no API calls or external services are used. Your data stays on your machine.

### Disk Footprint

Rough estimates for a single DAO's database:

- **1000 proposals**: ~50–100 MB (embeddings + metadata)
- **Embedding model cache**: ~30 MB (downloaded once, reused)

## Typical Workflow

1. **First time with a new DAO:**
   ```bash
   builder-dao sync --pretty          # Download all proposals
   builder-dao index --pretty          # Generate embeddings (~1 min for 100 proposals)
   builder-dao search "key topic" --pretty  # Search
   ```

2. **Later — keep data fresh:**
   ```bash
   builder-dao sync --pretty          # Incremental — only new proposals
   builder-dao index --pretty          # Only indexes missing embeddings
   builder-dao search "..." --pretty   # Search updated data
   ```

3. **Use with MCP:**
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

   Then call `sync_proposals`, `index_embeddings`, `search_proposals` from Claude Desktop or Cursor.

## License

MIT
