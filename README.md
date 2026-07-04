# vectojs-website

> Marketing site, demo gallery, docs, and blog for **[VectoJS](https://github.com/vectojs/vectojs)** —
> a Zero-DOM, canvas-native UI runtime. Built with [Astro](https://astro.build).

**Live**: https://vectojs.xuepoo.xyz

This repo is intentionally separate from the engine (`vectojs/vectojs`) so the engine stays lean
and every demo here can double as a real stress test against a real published version of
`@vectojs/core` / `@vectojs/ui` / `@vectojs/three` — the same way any other consumer would use them.

## What's in here

| Path                     | Contents                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/demos/`       | Interactive demo pages — Danmaku at scale, Nexus (WebGPU particles), AI Chat (streaming Markdown), Fruit Catch, Knowledge Graph, Dimension (Three.js), Pool |
| `src/pages/compare/`     | Live, same-device DOM-vs-VectoJS benchmark (danmaku), plus an isolated fair-benchmark sweep                                                                 |
| `src/demos/`             | The TypeScript behind each demo — one module per demo, mostly `@vectojs/*` calls                                                                            |
| `src/content/learn/`     | Long-form docs: architecture, custom entities, events, physics, particles, performance, text, a11y, cookbook                                                |
| `src/content/reference/` | Generated-by-hand API reference for `@vectojs/core`, `@vectojs/ui`, `@vectojs/three`, plus an FAQ                                                           |
| `src/content/blog/`      | Articles on the philosophy and mechanics behind VectoJS                                                                                                     |
| `src/consts.ts`          | Site-wide constants: displayed package versions, demo registry, docs nav — **the single source of truth for the sidebar**                                   |
| `scripts/`               | Asset fetching, Cloudflare Pages deploy, and browser-driven regression tests (GPU/demo smoke test, DPR/hit-testing regression, keyboard nav)                |

## Quick start

```bash
bun install
bun run dev       # fetches demo assets once, then starts the Astro dev server
```

```bash
bun run build     # fetches assets, builds the static site to dist/
bun run preview   # serves the built dist/ locally
```

## Testing

```bash
bun run test          # unit tests (bun test) — demo logic: workload generation, tokenizer, math inline, etc.
bun run check          # astro check — type-checks .astro files + TS
bun run test:demos    # headless-Chrome smoke test: every demo loads, renders a canvas, no console errors
bun run test:dpr      # hit-testing regression at deviceScaleFactor 2 (HiDPI)
bun run test:keyboard # keyboard-navigation smoke test across demo pages
```

`bun run test:demos` needs a real GPU-capable headless Chrome; it's the closest thing this repo has
to an integration test, since the demos are the actual product surface. UI changes should also be
spot-checked in a real browser — headless/software-rasterizer FPS numbers are a floor, not what a
real GPU shows.

## Formatting & linting

Pre-commit (Husky + lint-staged) runs the globally installed `oxlint` and `prettier` on staged
files. To run them manually across the repo:

```bash
oxlint
prettier --check .
```

## Deploying

```bash
just deploy   # pre-commit checks → astro build → scripts/deploy-pages.sh → Cloudflare Pages
```

`scripts/deploy-pages.sh` wraps `wrangler pages deploy`; see the script for the exact flags
(proxy handling, commit-dirty behavior). The `Justfile` also has `just edit` (dev server), `just
status`, and `just commit "<message>"` for the common local loop.

## Keeping demos honest

Demos in this repo run against a real, published version of the engine — not a local workspace
link. When `@vectojs/core`/`@vectojs/ui`/`@vectojs/three` cut a new release, bump the versions in
`package.json` **and** in `src/consts.ts`'s `VERSIONS` constant (shown in the docs sidebar) so the
site never quietly drifts from what's actually installed.

## Related

- **Engine**: [vectojs/vectojs](https://github.com/vectojs/vectojs) — `@vectojs/core`, `@vectojs/ui`, `@vectojs/three`
- **Docs**: https://vectojs.xuepoo.xyz/learn/introduction/
- **Demo gallery**: https://vectojs.xuepoo.xyz/demos/

## License

MIT © 2026 Xuepoo
