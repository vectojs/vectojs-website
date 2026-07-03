/**
 * DPR/zoom coordinate-mapping regression test for canvas/WebGL pointer dispatch.
 *
 * Formalizes the manual repro/verification used to find and fix the
 * @vectojs/three 0.1.1 -> 0.1.2 bug (UV hits mapped through the physical,
 * DPR-scaled canvas size instead of the logical scene size -- every click landed
 * below/right of the cursor by exactly the DPR factor). See
 * docs/testing-catalog.md's "DPR and zoom regression checklist" -- this script is
 * that checklist's automated half. Run this against any future change that touches
 * pointer-to-canvas coordinate mapping, not just Dimension.
 *
 * Method: for each DPR in the matrix, grid-probe the Dimension canvas until a click
 * actually decrements the particle count (i.e. lands on the '-' stepper), then
 * confirm it happened exactly once. Headless-only (proves the mapping math is
 * DPR-correct); it cannot catch the separate, real-mouse-only OrbitControls
 * pointer-capture class of bug fixed earlier in this repo's history -- that one
 * needs the real-device hands-on pass in the catalog.
 *
 * IMPORTANT: the HUD's particle count (#hud-dimension-particles) is only refreshed
 * by a 500ms `setInterval` in dimension.ts, not synchronously on click -- so each
 * probe attempt MUST wait past that interval before reading the HUD, and that wait
 * must happen as a real Playwright await between attempts, not inside one
 * synchronous page.evaluate() (a tight synchronous loop can't yield to the
 * interval's callback at all, so every attempt appears to have no effect even
 * when several actually landed on the button). This cost real debugging time --
 * don't reintroduce a synchronous multi-attempt loop here.
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
// HUD refresh interval in dimension.ts is 500ms; comfortably clear it per attempt.
const HUD_SETTLE_MS = 600;

// Centered on the '-' stepper's measured position at 1280x800 (screenshot-verified
// directly against a headless render), with enough margin either side to absorb
// small future layout tweaks without needing to rescan the whole canvas at this
// per-attempt cost. DPR doesn't affect CSS layout (only backing-store
// resolution), so this fraction holds across the whole DPR_MATRIX unchanged.
const SEARCH_FX = [0.33, 0.36, 0.39, 0.42, 0.45];
const SEARCH_FY = [0.35, 0.38, 0.41, 0.44];

async function readParticleCount(page: PlaywrightPage): Promise<string | null | undefined> {
  return page.evaluate(() => document.getElementById('hud-dimension-particles')?.textContent);
}

async function findMinusButtonCenter(
  page: PlaywrightPage,
): Promise<{ x: number; y: number } | null> {
  const rect = await page.evaluate(
    () => document.getElementById('dimension-canvas')?.getBoundingClientRect(),
  );
  if (!rect) return null;

  for (const fy of SEARCH_FY) {
    for (const fx of SEARCH_FX) {
      const x = rect.x + rect.width * fx;
      const y = rect.y + rect.height * fy;
      const before = await readParticleCount(page);
      await page.evaluate(
        ({ x, y }: { x: number; y: number }) => {
          const canvas = document.getElementById('dimension-canvas') as HTMLCanvasElement;
          for (const type of ['pointerdown', 'pointerup', 'click']) {
            canvas.dispatchEvent(
              new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
            );
          }
        },
        { x, y },
      );
      // Real await between dispatch and read: lets the page's 500ms HUD-refresh
      // interval actually fire. See the file-level comment -- this is not
      // incidental, a synchronous loop here silently breaks detection.
      await page.waitForTimeout(HUD_SETTLE_MS);
      const after = await readParticleCount(page);
      if (after !== before) return { x, y };
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
    await page.goto(`${BASE_URL}/demos/dimension/`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);

    const reportedDPR = await page.evaluate(() => window.devicePixelRatio);
    results.push({
      name: `DPR ${dpr}: window.devicePixelRatio reflects requested value`,
      pass: Math.abs(reportedDPR - dpr) < 0.01,
      detail: `requested ${dpr}, actual ${reportedDPR}`,
    });

    const before = await readParticleCount(page);
    const center = await findMinusButtonCenter(page);
    results.push({
      name: `DPR ${dpr}: '-' stepper click registers (no DPR offset)`,
      pass: center !== null,
      detail: center
        ? `hit at (${center.x.toFixed(0)}, ${center.y.toFixed(0)})`
        : 'no click within probe grid decremented the count -- possible DPR mapping regression',
    });
    const after = await readParticleCount(page);
    results.push({
      name: `DPR ${dpr}: particle count actually decremented`,
      pass: before !== after,
      detail: `${before} -> ${after}`,
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
  const ok = printReport('DPR/zoom coordinate-mapping regression (Dimension)', allResults);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
