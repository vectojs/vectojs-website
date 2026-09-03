# Collaboration and workspace rules

1. CarryCtx is the durable coordination record. Use named sessions, task claims, declared scopes, `progress note`, risk/block notes, `decision add`, and `checkpoint`.
2. Subagents perform scoped implementation. The commander dispatches independent work, reads results back from CarryCtx, verifies diffs, and owns integration.
3. Prefer one Git worktree per implementation task. In a shared checkout, work only within explicitly disjoint scopes and preserve unrelated/untracked files.
4. Run Git and CarryCtx inside the named child repository (`vectojs-website`); the umbrella workspace root is not a Git repository. Runtime state is `<git-common-dir>/carryctx/state.sqlite`.
5. For source analysis use `ctxctl` in order: `outline`, targeted `symbol` or narrow `read`, then `deps`; compress verbose commands with `ctxctl exec`.
6. Use the persistent workspace `../recording/` and `../.trash/vectojs-website/` (never `tmp/`, `/tmp`, or bare `rm` for obsolete files) and record moves.
7. Do not commit, merge, publish, install external code, or broaden task scope without explicit authority. Implementers hand off at `in_review`; a separate reviewer completes verified tasks.
8. Do not enable the `prepare-commit-msg` hook — it prefixes `[CTX-NNNN]` and fails `commitlint` (`lefthook.yml:commit-msg`).
