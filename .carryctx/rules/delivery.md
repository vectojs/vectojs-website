# Delivery rules

1. The primary lifecycle is GitHub Issue, CarryCtx task, branch/worktree, commit, pull request, independent review plus CI, merge, then Issue closure and final CarryCtx `checkpoint`/task completion.
2. Link the GitHub Issue and CarryCtx task. Map repository ownership to a team, prerequisite order to dependencies, intended edits to scopes, active work to a named session and progress, recoverable milestones to checkpoints, and ownership transfer to a handoff.
3. Start only accepted, dependency-ready work. Record material `decision add`, blockers, risks, verification, and remaining gaps while work is active.
4. After the first repository commit, use a dedicated branch and worktree for parallel implementation or substantial site/content work. Keep commits coherent, scoped, reviewable, and linked to the Issue and task.
5. A pull request must state the user/contract outcome, affected `src/content/**` and `src/pages/**` or `src/demos/**`, deploy impact, validation evidence (`bun run check`, `bun run lint:md`, `bun run build`), dependencies, and any follow-up that prevents completion.
6. Review is independent from implementation. The reviewer inspects the diff, content contracts, edge cases, and reproducible CI evidence before acceptance.
7. Docs/content synchronization is part of definition of done. A behavior, demo, or reference change remains incomplete while its canonical site docs or `src/consts.ts` VERSIONS/nav are stale.
8. Merge only after required review findings and CI failures are resolved. Do not treat a task self-report or partial check as acceptance evidence.
9. After merge, close the Issue, record merged revision and final evidence in a CarryCtx `checkpoint`, complete the task, and retain explicit follow-up tasks for separately authorized work.
