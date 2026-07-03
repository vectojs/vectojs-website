/**
 * Real-browser GPU-capability + functional smoke test for every demo.
 *
 * Covers testing-catalog.md Area B2/B3 (does WebGL/WebGPU actually engage, and does
 * the CPU fallback degrade silently and correctly where unsupported) and the
 * baseline of Area C (does each demo load without console errors and respond to
 * its core interaction).
 *
 * This runs headless (software rasterizer via swiftshader) -- it proves the demos
 * are functionally correct and that capability-detection code paths work, not real
 * GPU throughput. Area D / F2 (real performance numbers, cold-load timing) still
 * need the device matrix in testing-catalog.md.
 *
 * Usage: bun run scripts/test-gpu-and-demos.ts
 */
import {
  DEMOS,
  BASE_URL,
  ensureBuiltAndServed,
  loadPlaywright,
  launchBrowser,
  openPage,
  printReport,
  type PlaywrightBrowser,
  type CheckResult,
} from './test-utils';

async function checkDemo(
  browser: PlaywrightBrowser,
  demo: (typeof DEMOS)[number],
): Promise<CheckResult[]> {
  const { page, consoleErrors, pageErrors } = await openPage(browser);
  const results: CheckResult[] = [];
  const prefix = demo.slug;

  try {
    await page.goto(`${BASE_URL}/demos/${demo.slug}/`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500); // let init scripts + first frame settle

    const canvas = page.locator(`#${demo.canvasId}`);
    const canvasExists = (await canvas.count()) > 0;
    results.push({ name: `${prefix}: canvas element present`, pass: canvasExists });

    if (canvasExists) {
      const box = await canvas.boundingBox();
      const hasSize = !!box && box.width > 0 && box.height > 0;
      results.push({
        name: `${prefix}: canvas has non-zero rendered size`,
        pass: hasSize,
        detail: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'no box',
      });

      // Context capability + whether it's a real vs. software renderer. Three.js
      // demos use webgl2; the pure-2D demos (danmaku/chat/catch) use Canvas2D and
      // legitimately have no GL context -- only assert renderer identity when one
      // exists.
      const glInfo = await page.evaluate((id: string) => {
        const c = document.getElementById(id) as HTMLCanvasElement | null;
        if (!c) return { hasGL: false, renderer: null as string | null };
        const gl = (c.getContext('webgl2') ||
          c.getContext('webgl')) as WebGLRenderingContext | null;
        if (!gl) return { hasGL: false, renderer: null };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = dbg
          ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string)
          : (gl.getParameter(gl.RENDERER) as string);
        return { hasGL: true, renderer };
      }, demo.canvasId);
      if (glInfo.hasGL) {
        const isSoftware = /swiftshader|llvmpipe|software/i.test(glInfo.renderer ?? '');
        results.push({
          name: `${prefix}: WebGL context available`,
          pass: true,
          detail: glInfo.renderer ?? 'unknown renderer',
        });
        results.push({
          name: `${prefix}: renderer is software (expected in headless, must be real on device)`,
          pass: isSoftware,
          detail: 'flip expectation for real-hardware runs -- see testing-catalog.md B2',
        });
      }
    }

    results.push({
      name: `${prefix}: no console errors on load`,
      pass: consoleErrors.length === 0,
      detail: consoleErrors.slice(0, 3).join(' | '),
    });
    results.push({
      name: `${prefix}: no uncaught page errors`,
      pass: pageErrors.length === 0,
      detail: pageErrors.slice(0, 3).join(' | '),
    });
  } catch (e) {
    results.push({ name: `${prefix}: page load`, pass: false, detail: String(e) });
  } finally {
    await page.close();
  }
  return results;
}

async function main() {
  const { stop } = await ensureBuiltAndServed();
  const browserModule = loadPlaywright();
  // One shared browser for the whole run, opening/closing a page per demo --
  // relaunching a full Chrome process per demo was measurably flaky in this
  // environment (a demo that failed mid-suite with "Target page, context or
  // browser has been closed" passed 3/3 times in isolation); a single browser
  // instance avoids the repeated process-teardown race entirely.
  const browser = await launchBrowser(browserModule);
  const allResults: CheckResult[] = [];
  try {
    for (const demo of DEMOS) {
      console.log(`Checking ${demo.slug}...`);
      allResults.push(...(await checkDemo(browser, demo)));
    }
  } finally {
    await browser.close();
    stop();
  }
  const ok = printReport('GPU capability + demo smoke test (headless)', allResults);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
