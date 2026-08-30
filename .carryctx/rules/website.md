# Website and content rules

1. This repo is a marketing site, demo gallery, and docs/blog host for `vectojs/*`. Build is `bun run build` (`build:search-index` + `build:js` + `zola build`); deploy is `wrangler pages deploy public/` via `.github/workflows/ci.yml:deploy`.
2. Content lives under `src/content/learn|reference|blog/**` (Markdown), pages under `src/pages/**` (Astro), demos under `src/demos/**`, site truth under `src/consts.ts` (VERSIONS, demo registry, docs nav), and static assets under `static/` and `public/`.
3. CI verify is `bun install --frozen-lockfile`, `bun run check` (`oxfmt --check` + `oxlint --deny-warnings src`), `bun run lint:md` (`markdownlint-cli2 "content/**/*.md"`), then `bun run build`. `carryctx verification.commands` mirrors exactly that.
4. Local hooks are `lefthook.yml`: pre-commit fixes `oxfmt`, `prettier` (.astro only), `oxlint --fix`, `markdownlint --fix`, plus `merge-conflicts` and `large-files` (500 KB); commit-msg runs `commitlint` (Conventional Commits). Do not duplicate lefthook fixers in `carryctx verify`.
5. Keep Astro and Zola boundaries intact: do not edit rendered `public/` or `dist/` by hand, and do not copy engine source — demos run against published `@vectojs/*` versions in `package.json` + `src/consts.ts`.
6. Every content change that alters user-visible behavior, API surface, demo capability, or performance claim must update the owning `src/content/**` and `src/consts.ts` together; stale docs block acceptance.
7. Validate content changes with the lightest relevant gate: `bun run lint:md` for prose, `bun run check` for `src/**` and formatting, `bun run build` (or `zola check`) for link/frontmatter/route integrity.
