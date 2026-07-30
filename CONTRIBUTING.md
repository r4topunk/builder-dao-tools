# Contributing

## Setup

```bash
pnpm install
pnpm -r build        # before typecheck: search resolves core via core's dist/
pnpm -r typecheck
pnpm lint
pnpm -r test:run
```

That is the order CI runs, so a green local run means a green pipeline.
`pnpm -r test` is also a one-shot run; use `pnpm -r test:watch` for watch mode.

## Running the CLI locally

```bash
pnpm --filter @builder-dao/cli dev -- proposals --limit 3
```

## Release flow (maintainers)

1. `pnpm changeset` — describe the change and bump type.
2. Open PR; CI must be green.
3. Merge; the `release.yml` workflow opens a "Version packages" PR.
4. Merge the version PR; the workflow publishes to npm.
