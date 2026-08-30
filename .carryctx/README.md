# CarryCtx

<!-- carryctx:v1 -->

This directory contains versioned CarryCtx project configuration.
Runtime state is stored in the repository's Git common directory, not here
(`<git-common-dir>/carryctx/state.sqlite`, e.g. `vectojs-website/.git/carryctx/state.sqlite`).
Do not edit that database by hand; use `carryctx task / session / checkpoint / doctor`.

Files here follow the same layout as `bitty-docs/.carryctx`: `config.toml`,
`personas/*.md`, `rules/*.md`, and this README. Verification commands mirror
`.github/workflows/ci.yml:verify` (`bun run check`, `bun run lint:md`) so
`carryctx verify` and CI agree. The `prepare-commit-msg` hook is intentionally
absent — it would prefix `[CTX-NNNN]` and fail `commitlint` (`lefthook.yml:commit-msg`).
