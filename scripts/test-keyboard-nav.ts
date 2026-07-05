/**
 * Keyboard-only navigation check across every demo (testing-catalog.md Area E4).
 *
 * This is necessarily a partial substitute for a real screen-reader/AT pass (E1-E3,
 * E6 in the catalog, which need your hands) -- what it verifies mechanically:
 * Tab reaches a visible, non-body focus target within each demo's controls, and
 * that target has an accessible name (matching the a11y shadow-DOM contract
 * @vectojs/core projects). It cannot judge whether the experience is actually
 * good, only that keyboard users aren't structurally locked out.
 *
 * Usage: bun run scripts/test-keyboard-nav.ts
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

const MAX_TABS = 30;

async function testDemoKeyboardNav(
  browser: PlaywrightBrowser,
  demo: (typeof DEMOS)[number],
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const { page } = await openPage(browser);
  const prefix = demo.slug;

  try {
    await page.goto(`${BASE_URL}${demo.path ?? `/demos/${demo.slug}/`}`, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await page.waitForTimeout(1500);

    let reachedInteractive = false;
    let firstFocusableName: string | null = null;
    let tabsToReach = -1;

    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // Only count elements inside the demo's own area, not header/nav chrome
        // that every page has regardless of the canvas UI's own a11y wiring.
        // [data-immersive] is the one container attribute all six demos share
        // (verified directly against every demos/*.astro); .controls is also
        // needed because some demos (dimension, danmaku, ...) put their control
        // panel as a sibling *outside* the immersive stage div, while others
        // (chat) nest everything inside one immersive container.
        const inDemoArea = !!el.closest('[data-immersive], .controls');
        if (!inDemoArea) return null;
        return {
          tag: el.tagName,
          role: el.getAttribute('role'),
          name:
            el.getAttribute('aria-label') ||
            ('labels' in el
              ? (el as HTMLInputElement).labels?.[0]?.textContent?.trim()
              : undefined) ||
            el.textContent?.trim() ||
            null,
        };
      });
      if (focused) {
        reachedInteractive = true;
        firstFocusableName = focused.name;
        tabsToReach = i + 1;
        break;
      }
    }

    results.push({
      name: `${prefix}: Tab reaches an interactive demo control within ${MAX_TABS} presses`,
      pass: reachedInteractive,
      detail: reachedInteractive
        ? `reached after ${tabsToReach} tabs, name="${firstFocusableName}"`
        : 'no focusable element inside .stage/.controls found -- keyboard users may be locked out',
    });

    if (reachedInteractive) {
      results.push({
        name: `${prefix}: first reachable control has an accessible name`,
        pass: !!firstFocusableName && firstFocusableName.length > 0,
        detail: firstFocusableName ?? '(none)',
      });
    }
  } catch (e) {
    results.push({
      name: `${prefix}: keyboard nav test execution`,
      pass: false,
      detail: String(e),
    });
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
    for (const demo of DEMOS) {
      console.log(`Checking ${demo.slug}...`);
      allResults.push(...(await testDemoKeyboardNav(browser, demo)));
    }
  } finally {
    await browser.close();
    stop();
  }
  const ok = printReport(
    'Keyboard-only navigation (mechanical check, not a real AT pass)',
    allResults,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
