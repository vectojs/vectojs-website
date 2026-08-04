/**
 * Fetch demo media that is too large to track in git (the pre-commit large-file
 * guard caps tracked files at 500 KB). Run by `bun run build` and `bun run dev`;
 * idempotent — skips anything already on disk. Keeps the repo lean while the
 * deployed site stays self-contained.
 *
 * Assets are served from the project's own R2 bucket (`cdn-vectojs`, origin
 * `https://cdn.vectojs.org/`) rather than from wherever they originally came
 * from. A third-party mirror in the build path is a liability: measured
 * 2026-08-04, `download.blender.org` was handing out this 7.6 MB file at
 * 25.7 KB/s, which stalled a `main` deploy past 14 minutes when the previous one
 * had taken 42 seconds end to end. The same object from R2 came down in 4.2s
 * (1.8 MB/s), byte-identical. Attribution is unchanged — the licence lives in
 * `note` and travels with the asset.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface Asset {
  path: string;
  url: string;
  /** Bytes expected on disk; a truncated download is worse than a failed one. */
  bytes: number;
  note: string;
}

const ASSETS: Asset[] = [
  {
    path: 'public/demos/sample.mp4',
    url: 'https://cdn.vectojs.org/website/demos/sample.mp4',
    bytes: 7_608_204,
    note: 'Sintel trailer © Blender Foundation, CC BY 3.0 (re-hosted on cdn.vectojs.org)',
  },
];

/** Per-attempt ceiling. Generous enough for a cold cache, short enough that a
 *  hung origin fails the job in minutes rather than burning its whole limit. */
const TIMEOUT_MS = 60_000;
const ATTEMPTS = 3;

async function download(asset: Asset): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      // An explicit signal is the whole point: a bare `fetch()` has no timeout,
      // so a slow origin blocks until the CI job itself is killed, with the log
      // frozen mid-line and nothing naming the cause.
      const res = await fetch(asset.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await Bun.write(asset.path, res);
      return;
    } catch (error) {
      lastError = error;
      const reason = error instanceof Error ? error.message : String(error);
      if (attempt < ATTEMPTS) {
        console.warn(`  attempt ${attempt}/${ATTEMPTS} failed (${reason}); retrying`);
      }
    }
  }
  throw new Error(
    `could not fetch ${asset.url} after ${ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

for (const asset of ASSETS) {
  if (existsSync(asset.path)) {
    console.log(`✓ ${asset.path} (already present)`);
    continue;
  }
  mkdirSync(dirname(asset.path), { recursive: true });
  console.log(`↓ ${asset.path}  ←  ${asset.url}  (${asset.note})`);
  await download(asset);
  // Verify the size rather than trusting a 200: a truncated write would ship a
  // broken video to production, where the demo silently fails to play.
  const written = Bun.file(asset.path).size;
  if (written !== asset.bytes) {
    throw new Error(`${asset.path}: expected ${asset.bytes} bytes, got ${written}`);
  }
  console.log(`✓ ${asset.path} (${written} bytes)`);
}
