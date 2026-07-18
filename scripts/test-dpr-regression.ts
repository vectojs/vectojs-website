/**
 * DPR/zoom coordinate-mapping regression test for canvas pointer dispatch.
 *
 * Preserves the logical-CSS-coordinate invariant behind the workspace's DPR and
 * zoom regression checklist: pointer coordinates must not be multiplied by the
 * canvas backing-store scale. The original Three.js/Dimension probe moved with
 * that retired demo; this site-owned check now covers the live Canvas2D surface.
 *
 * Method: for each DPR in the matrix, grid-probe the public Danmaku canvas until a
 * comment click opens its canvas-native action menu. The menu's projected semantic
 * buttons are the observable result of a correctly mapped canvas hit. The former
 * Dimension probe moved out with that demo when it was retired from this site.
 *
 * Usage: bun run scripts/test-dpr-regression.ts
 */
import {
  BASE_URL,
  ensureBuiltAndServed,
  loadPlaywright,
  launchBrowser,
  openPage,
  printReport,
  type PlaywrightBrowser,
  type PlaywrightPage,
  type CheckResult,
} from './test-utils';

const DPR_MATRIX = [1, 1.5, 2, 3];
const MENU_SETTLE_MS = 160;
const SEARCH_FX = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
const SEARCH_FY = [0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64];

async function hasActionMenu(page: PlaywrightPage): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-vecto-id]')).some((node) =>
      (node.getAttribute('aria-label') ?? node.textContent ?? '').includes('Like'),
    ),
  );
}

async function findCommentHit(page: PlaywrightPage): Promise<{ x: number; y: number } | null> {
  const rect = await page.evaluate(() =>
    document.getElementById('danmaku-canvas')?.getBoundingClientRect(),
  );
  if (!rect) return null;

  for (const fy of SEARCH_FY) {
    for (const fx of SEARCH_FX) {
      const x = rect.x + rect.width * fx;
      const y = rect.y + rect.height * fy;
      await page.evaluate(
        ({ x, y }: { x: number; y: number }) => {
          const canvas = document.getElementById('danmaku-canvas') as HTMLCanvasElement;
          for (const type of ['pointerdown', 'pointerup', 'click']) {
            canvas.dispatchEvent(
              new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
            );
          }
        },
        { x, y },
      );
      await page.waitForTimeout(MENU_SETTLE_MS);
      if (await hasActionMenu(page)) return { x, y };
    }
  }
  return null;
}

async function testAtDPR(browser: PlaywrightBrowser, dpr: number): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const { page } = await openPage(browser, {
    deviceScaleFactor: dpr,
    viewport: { width: 1280, height: 800 },
  });
  try {
    await page.goto(`${BASE_URL}/demos/danmaku/`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);

    const reportedDPR = await page.evaluate(() => window.devicePixelRatio);
    results.push({
      name: `DPR ${dpr}: window.devicePixelRatio reflects requested value`,
      pass: Math.abs(reportedDPR - dpr) < 0.01,
      detail: `requested ${dpr}, actual ${reportedDPR}`,
    });

    const center = await findCommentHit(page);
    results.push({
      name: `DPR ${dpr}: canvas comment click opens the action menu`,
      pass: center !== null,
      detail: center
        ? `hit at (${center.x.toFixed(0)}, ${center.y.toFixed(0)})`
        : 'no probe opened the action menu -- possible DPR mapping regression',
    });
    results.push({
      name: `DPR ${dpr}: action menu exposes projected semantic controls`,
      pass: await hasActionMenu(page),
      detail: center ? 'Like/Copy/Report controls projected' : 'no projected menu controls',
    });
  } catch (e) {
    results.push({ name: `DPR ${dpr}: test execution`, pass: false, detail: String(e) });
  } finally {
    await page.close();
  }
  return results;
}

async function main() {
  const { stop } = await ensureBuiltAndServed();
  const browserModule = loadPlaywright();
  const browser = await launchBrowser(browserModule);
  const allResults: CheckResult[] = [];
  try {
    for (const dpr of DPR_MATRIX) {
      console.log(`Checking DPR ${dpr}...`);
      allResults.push(...(await testAtDPR(browser, dpr)));
    }
  } finally {
    await browser.close();
    stop();
  }
  const ok = printReport('DPR/zoom coordinate-mapping regression (Danmaku)', allResults);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
