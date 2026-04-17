# Contributing

## Setup

```bash
pnpm install
pnpm -r build
pnpm -r test:run
```

## Running the CLI locally

```bash
pnpm --filter @builder-dao/cli dev -- proposals --limit 3
```

## Release flow (maintainers)

1. `pnpm changeset` — describe the change and bump type.
2. Open PR; CI must be green.
3. Merge; the `release.yml` workflow opens a "Version packages" PR.
4. Merge the version PR; the workflow publishes to npm.
