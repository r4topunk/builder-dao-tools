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

The core CLI loads this addon automatically when it is installed and resolvable —
no extra configuration needed. (Core imports `@builder-dao/cli-search` by name at
startup; see the note on addon discovery in the [plugin guide](../../docs/plugin-api.md#discovery).)

## Commands

### `sync`

Pull proposals from the Goldsky subgraph into a local per-DAO SQLite database.

```bash
builder-dao sync [--full]
```

| Flag | Type | Description |
|---|---|---|
| `--full` | boolean | Force a complete re-sync of every proposal |

**How the default (incremental) mode behaves:**

- **First run backfills.** With no stored watermark there is nothing to be
  incremental against, so `sync` runs the full backfill automatically. You do
  not need `--full` to seed a fresh database.
- **It paginates.** Both the backfill and the incremental window page through the
  subgraph in batches of 50 until a short page, so there is no 100-proposal cap.
- **The watermark only advances on success.** It is set to the `timeCreated` of
  the newest proposal actually stored — not wall-clock `now`, so clock skew
  between your machine and the indexer cannot open a hole. If a proposal fetch
  fails, the watermark is left untouched so the next run retries that window.
- **Failures are loud.** The command prints `success: false` with the collected
  `errors` and exits non-zero. A failed sync is never reported as a successful
  one.

Use `--full` when you want to re-read everything regardless of the watermark —
e.g. after a schema change or if you suspect the local copy drifted.

**Example:**
```bash
# First sync — backfills everything, no flag needed
builder-dao sync --pretty

# Later runs — only the window since the last successful sync
builder-dao sync --pretty

# Force a complete re-sync
builder-dao sync --full --pretty
```

**Output:** JSON object with `success` (boolean), `synced`, `updated`, `errors`
(array), and `lastSyncTime` (ISO timestamp of the stored watermark).

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

The addon stores proposals in a SQLite database per DAO. The path is resolved in
this order (see `src/db/connection.ts`):

1. `$DB_PATH`, used verbatim, if set.
2. `$XDG_DATA_HOME/builder-dao/{dao-addr-short}.db` when `XDG_DATA_HOME` is set.
3. Otherwise `~/.local/share/builder-dao/{dao-addr-short}.db`.

(`openDatabase()` also accepts a programmatic path override, but no CLI flag is
wired to it — use `DB_PATH` from the command line.)

`{dao-addr-short}` is the first 10 characters of the DAO address (`0x` + 8 hex
chars). The parent directory is created on first use.

The same XDG-style layout is used on every platform — there is **no**
platform-specific branch, so on Windows the default resolves under the user
profile (`%USERPROFILE%\.local\share\builder-dao\`), not `%LOCALAPPDATA%`. Set
`XDG_DATA_HOME` or `DB_PATH` if you want it elsewhere.

Example for Gnars (`0x880fb3cf...`) with `XDG_DATA_HOME` unset:
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
   builder-dao sync --pretty          # Backfills all proposals (no --full needed)
   builder-dao index --pretty          # Generate embeddings (~1 min for 100 proposals)
   builder-dao search "key topic" --pretty  # Search
   ```

2. **Later — keep data fresh:**
   ```bash
   builder-dao sync --pretty          # Incremental — only the window since last success
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
