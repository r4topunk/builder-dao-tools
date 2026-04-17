# Migrating from gnars-subgraph-mcp to @builder-dao/cli

A step-by-step guide for users of the old `gnars-subgraph-mcp` package.

## Why Migrate

The old `gnars-subgraph-mcp` package was hardcoded for Gnars DAO and bundled into the Gnars website repository. The new `@builder-dao/cli` + `@builder-dao/cli-search` packages:

- Work for **any Nouns Builder DAO on Base**, not just Gnars
- Are **published on npm** as standalone packages
- Support a **pluggable architecture** for feature addons
- Are **decoupled from the website repo**
- Have **maintained backwards compatibility** for all commands and tool names

The code is the same; it's been generalized and modularized.

## Package Migration

| Old | New |
|-----|-----|
| `gnars-subgraph-mcp` | `@builder-dao/cli` (core) + `@builder-dao/cli-search` (search addon) |
| Binary: `gnars` | Binary: `builder-dao` |
| Gnars-specific defaults | No DAO defaults; config is runtime-driven |

## Install Diff

**Old workflow:**

```bash
pnpm add -g gnars-subgraph-mcp
export GOLDSKY_PROJECT_ID=project_cm33ek8kjx6pz010i2c3w8z25  # Gnars subgraph
gnars proposals
gnars mcp
```

**New workflow:**

```bash
pnpm add -g @builder-dao/cli @builder-dao/cli-search

# Set up Gnars env (see gnars.env example in this repo)
export DAO_ADDRESS=0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17
export GOLDSKY_PROJECT_ID=project_cm33ek8kjx6pz010i2c3w8z25

builder-dao proposals
builder-dao mcp
```

See `examples/gnars.env` in this repo to copy the exact values for Gnars.

## Environment Variable Diff

| Old | New |
|-----|-----|
| `GOLDSKY_PROJECT_ID` only (DAO hardcoded to Gnars) | `DAO_ADDRESS` + `GOLDSKY_PROJECT_ID` both required |

The old package assumed you were querying Gnars. The new one requires you to specify which DAO (by its token contract address).

**Example: Set up for Gnars:**

```bash
export DAO_ADDRESS=0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17
export GOLDSKY_PROJECT_ID=project_cm33ek8kjx6pz010i2c3w8z25
```

**Example: Switch to a different Builder DAO:**

```bash
export DAO_ADDRESS=0x<another-dao-token-address>
export GOLDSKY_PROJECT_ID=<that-dao-subgraph-project-id>
```

All subsequent commands will transparently use the new DAO's data.

## Command-Name Mapping

The command names **remain the same** for backwards compatibility. Just swap the binary name:

| Old | New |
|-----|-----|
| `gnars proposals` | `builder-dao proposals` |
| `gnars proposal N` | `builder-dao proposal N` |
| `gnars votes N` | `builder-dao votes N` |
| `gnars vote N FOR` | `builder-dao vote N FOR` |
| `gnars ens 0x...` | `builder-dao ens 0x...` |
| `gnars sync` | `builder-dao sync` (requires `@builder-dao/cli-search`) |
| `gnars index` | `builder-dao index` (requires `@builder-dao/cli-search`) |
| `gnars search "..."` | `builder-dao search "..."` (requires `@builder-dao/cli-search`) |

All flags, arguments, and outputs are identical.

## MCP Client Configuration Diff

**Old Claude Desktop config** (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gnars-subgraph": {
      "command": "gnars",
      "args": ["mcp"],
      "env": {
        "GOLDSKY_PROJECT_ID": "project_cm33ek8kjx6pz010i2c3w8z25"
      }
    }
  }
}
```

**New Claude Desktop config:**

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

**Changes:**
- Server name: `gnars-subgraph` → `builder-dao` (arbitrary; use any name you prefer)
- Command: `gnars` → `builder-dao`
- Add `DAO_ADDRESS` env variable

**Same for Cursor** (`.cursor/mcp.json`):

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

Tool names remain the same:
- `list_proposals`
- `get_proposal`
- `get_proposal_votes`
- `cast_vote`
- `resolve_ens`
- `resolve_ens_batch`
- `sync_proposals` (with addon)
- `search_proposals` (with addon)
- `index_embeddings` (with addon)

## Database Migration

**Old location:**
```
./data/gnars.db
```

**New location (per-DAO):**
```
$XDG_DATA_HOME/builder-dao/0x880fb3cf.db  (first 10 chars of address)
```

On macOS:
```
~/.local/share/builder-dao/0x880fb3cf.db
```

**Options:**

1. **Move the old database:**
   ```bash
   mkdir -p ~/.local/share/builder-dao
   mv ./data/gnars.db ~/.local/share/builder-dao/0x880fb3cf.db
   builder-dao index  # Re-index embeddings with the migrated DB
   ```

2. **Start fresh (re-sync):**
   ```bash
   builder-dao sync --full --pretty    # Downloads all Gnars proposals
   builder-dao index --pretty           # Generates embeddings
   ```

Both approaches work. Option 2 is simpler if you don't need the old DB; option 1 preserves history and saves bandwidth.

## Governor Address

In the old package, the governor contract address was hardcoded in the `cast-vote` tool:

```typescript
const GOVERNOR_ADDRESS = "0x2ff7852a23e408cb6b7ba5c89384672eb88dab2e";  // Gnars-specific
```

**New approach:**

The governor address is **resolved at runtime** from the Goldsky subgraph. One GraphQL query fetches it based on the DAO's token address. No hardcoding, no updates needed when migrating to a different DAO.

**User experience:** No change. `builder-dao vote N FOR` works the same way; the address resolution is transparent.

## Configuration File (Optional)

If you prefer a persistent config file instead of env vars or CLI flags, you can create:

```
$XDG_CONFIG_HOME/builder-dao/config.json
```

Example:
```json
{
  "daoAddress": "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17",
  "goldskyProjectId": "project_cm33ek8kjx6pz010i2c3w8z25",
  "chainId": 8453,
  "rpcUrl": "https://mainnet.base.org"
}
```

**Precedence** (highest wins):
1. CLI flags (`--dao`, `--subgraph-project`, `--rpc-url`)
2. Environment variables (`DAO_ADDRESS`, `GOLDSKY_PROJECT_ID`, `BASE_RPC_URL`)
3. Config file
4. Error if required values still missing

## Private Key for Voting

If you use the `vote` command, the private key setup is identical:

```bash
export PRIVATE_KEY=0x...
builder-dao vote 42 FOR --reason "Strong proposal"
```

**Security remains unchanged:**
- Never pass the key as a CLI argument.
- Prefer ephemeral shells: `env PRIVATE_KEY=0x... builder-dao vote 42 FOR`
- Never commit `.env` files.

## Checklist: Full Migration

- [ ] Uninstall old package: `npm uninstall -g gnars-subgraph-mcp`
- [ ] Install new packages: `npm install -g @builder-dao/cli @builder-dao/cli-search`
- [ ] Set `DAO_ADDRESS` and `GOLDSKY_PROJECT_ID` env (copy from `examples/gnars.env` if using Gnars)
- [ ] Test core commands: `builder-dao proposals --pretty`
- [ ] Optionally migrate DB: `~/.local/share/builder-dao/0x880fb3cf.db`
- [ ] Update MCP client config (Claude Desktop / Cursor)
- [ ] Update any scripts or workflows to use `builder-dao` instead of `gnars`
- [ ] Delete old `./data/gnars.db` if no longer needed

## Troubleshooting

**"Missing DAO address"**
- Set `DAO_ADDRESS` env or use `--dao` flag.

**"Command 'search' not found"**
- Install the addon: `npm install -g @builder-dao/cli-search`

**"Database file not found; sync first"**
- Run `builder-dao sync --full --pretty` to download proposals.

**Wrong proposals showing up**
- Verify `DAO_ADDRESS` and `GOLDSKY_PROJECT_ID` are correct for the DAO you want.
- Different env/flag combinations may have switched your DAO context.

**MCP tools not appearing in Claude Desktop**
- Reload Claude Desktop or restart Cursor.
- Check `~/.claude/claude_desktop_config.json` has the correct command (`builder-dao`) and env vars set.

## Next Steps

- Review `packages/core/README.md` for full command reference and CLI examples.
- Check `docs/architecture.md` for system design (useful for advanced use cases).
- Explore `docs/plugin-api.md` if you want to build your own addon.
