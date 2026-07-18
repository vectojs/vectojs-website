/**
 * Shared harness for the website's real-browser test scripts (test-gpu-and-demos.ts,
 * test-dpr-regression.ts, test-keyboard-nav.ts). Mirrors the engine repo's own
 * scripts/compare-dom.ts / compare-pretext.ts convention: raw Playwright API against
 * the globally-installed playwright + google-chrome-stable, no new project
 * dependency, in-process static serving (no child dev server) so it stays
 * CI/sandbox-safe.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const DIST_DIR = join(REPO_ROOT, 'dist');
export const PORT = 8971;
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export interface DemoInfo {
  slug: string;
  canvasId: string;
  /** Overrides the default `/demos/<slug>/` URL for pages that don't live under /demos/. */
  path?: string;
}

// Keep this list aligned with the public demo registry in src/consts.ts. Demos
// moved to the Gallery must leave this smoke-test matrix in the same change so
// the harness never turns an intentional route retirement into a false runtime
// regression.
export const DEMOS: DemoInfo[] = [{ slug: 'danmaku', canvasId: 'danmaku-canvas' }];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

/** Ensure dist/ exists (build it if missing) and serve it via Bun.serve. */
export async function ensureBuiltAndServed(): Promise<{ stop: () => void }> {
  if (!existsSync(join(DIST_DIR, 'index.html'))) {
    console.log('dist/ missing or incomplete — running `bun run build` first...');
    execSync('bun run build', { cwd: REPO_ROOT, stdio: 'inherit' });
  }
  const server = Bun.serve({
    port: PORT,
    async fetch(req: Request) {
      const url = new URL(req.url);
      let path = url.pathname;
      if (path.endsWith('/')) path += 'index.html';
      const file = Bun.file(join(DIST_DIR, path));
      if (await file.exists()) {
        const type = MIME[extname(path)] ?? 'application/octet-stream';
        return new Response(file, { headers: { 'content-type': type } });
      }
      return new Response('Not found', { status: 404 });
    },
  });
  return { stop: () => server.stop(true) };
}

// Minimal shape covering only what these scripts call. playwright is globally
// installed (per this workspace's tool-invocation convention), not a project
// dependency, so its own published types aren't resolvable here -- this is a
// deliberately narrow, honest surface rather than an inaccurate full re-declaration.
export interface PlaywrightConsoleMessage {
  type(): string;
  text(): string;
}
export interface PlaywrightLocator {
  count(): Promise<number>;
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
}
export interface PlaywrightPage {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  locator(selector: string): PlaywrightLocator;
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  evaluate<T, Arg>(fn: (arg: Arg) => T | Promise<T>, arg: Arg): Promise<T>;
  keyboard: { press(key: string): Promise<void> };
  on(event: 'console', handler: (msg: PlaywrightConsoleMessage) => void): void;
  on(event: 'pageerror', handler: (err: Error) => void): void;
  close(): Promise<void>;
}
export interface PlaywrightBrowser {
  newPage(opts: {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
  }): Promise<PlaywrightPage>;
  close(): Promise<void>;
}
export interface PlaywrightModule {
  chromium: { launch(opts: unknown): Promise<PlaywrightBrowser> };
}

export function loadPlaywright(): PlaywrightModule {
  const pkgDir = dirname(execSync('readlink -f "$(which playwright)"').toString().trim());
  return createRequire(join(pkgDir, 'package.json'))(pkgDir) as PlaywrightModule;
}

export function chromePath(): string {
  return execSync('readlink -f "$(which google-chrome-stable)"').toString().trim();
}

// WebGL requires a software rasterizer flag set in headless Chrome, or every
// canvas/three.js demo silently gets a null context. Matches the flags this
// session already validated empirically against the Dimension demo.
export const WEBGL_HEADLESS_ARGS = [
  '--no-sandbox',
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--enable-webgl2',
];

export interface LaunchOptions {
  deviceScaleFactor?: number;
  viewport?: { width: number; height: number };
}

/**
 * Launch one browser for a whole test run. Prefer this + openPage() over
 * launchPage() when testing multiple pages in sequence: relaunching a full Chrome
 * process (its own GPU + renderer + zygote processes) per page is both slow and,
 * observed directly in this repo, prone to a resource-contention race when done
 * back-to-back in a tight loop -- one page in a multi-demo suite failed with
 * "Target page, context or browser has been closed" while passing 3/3 in
 * isolation. A single shared browser opening/closing pages avoids the repeated
 * process-teardown race entirely.
 */
export async function launchBrowser(browserModule: Awaited<ReturnType<typeof loadPlaywright>>) {
  return browserModule.chromium.launch({
    headless: true,
    executablePath: chromePath(),
    args: WEBGL_HEADLESS_ARGS,
  });
}

export async function openPage(browser: PlaywrightBrowser, opts: LaunchOptions = {}) {
  const page = await browser.newPage({
    viewport: opts.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: opts.deviceScaleFactor ?? 1,
  });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    const expectedCapabilityFallback =
      text.includes('Failed to initialize WebGPU:') &&
      (text.includes('No GPUAdapter found') || text.includes('WebGPU not supported'));
    if (msg.type() === 'error' && !expectedCapabilityFallback) consoleErrors.push(text);
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  return { page, consoleErrors, pageErrors };
}

/** Single-page convenience wrapper (its own browser instance) for one-off scripts. */
export async function launchPage(
  browserModule: Awaited<ReturnType<typeof loadPlaywright>>,
  opts: LaunchOptions = {},
) {
  const browser = await launchBrowser(browserModule);
  const { page, consoleErrors, pageErrors } = await openPage(browser, opts);
  return { browser, page, consoleErrors, pageErrors };
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

export function printReport(title: string, results: CheckResult[]): boolean {
  console.log(`\n## ${title}\n`);
  console.log('| Check | Result | Detail |');
  console.log('| --- | --- | --- |');
  for (const r of results) {
    console.log(`| ${r.name} | ${r.pass ? '✅ pass' : '❌ FAIL'} | ${r.detail ?? ''} |`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  return failed.length === 0;
}
