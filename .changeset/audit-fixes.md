---
"@builder-dao/cli": patch
"@builder-dao/cli-search": patch
---

Audit fixes across both packages.

`@builder-dao/cli`:

- `builder-dao mcp` no longer crashes on startup. The server registered the core
  commands a second time, tripping the registry's duplicate guard, so both stdio
  and `--sse` failed immediately.
- `vote` / `cast_vote` can reach the write path again. The preflight read a
  `hasVoted` getter that does not exist on the Nouns Builder governor, so the
  `eth_call` always reverted and `writeContract` was never called. It now
  simulates `castVote` instead, which surfaces `ALREADY_VOTED` and inactive
  proposals as friendly errors.
- `resolve_ens` returns `name: null` when an address has no ENS record instead of
  echoing the provider's shortened-address `displayName`, which also inflated the
  `resolved` count in `resolve_ens_batch`.
- `list_proposals` and `get_proposal_votes` report `total`, `hasMore` and the vote
  `summary` over the whole result set rather than the current page.
- `--order asc` now orders globally instead of reversing each page in isolation.
- `mcp` appears in `--help`, and `--sse` is listed under the global flags.
- The MCP server reports the real package version instead of a hardcoded one.

`@builder-dao/cli-search`:

- `sync` backfills on the first run instead of taking the incremental path
  against an empty database, and the incremental path paginates instead of
  stopping at 100 proposals.
- A failed fetch no longer advances the sync watermark (which permanently skipped
  the failed window) and no longer exits 0 with success-shaped output. The
  watermark tracks the newest proposal actually stored rather than wall-clock
  time.

Packaging and docs: both manifests gained `engines`, `repository`, `homepage`,
`bugs` and `author`; a `LICENSE` now ships in each tarball; broken source maps
are no longer emitted; the `@builder-dao/cli` peer range in the search addon was
relaxed to `>=0.1.0 <1`; `test` scripts no longer default to watch mode; and the
READMEs were corrected (tool count, plugin discovery scope, Claude Desktop config
path, database location, `sync` behavior).
