/**
 * Browser regression check for the shared UI component sandbox. The public
 * interface is its ready signal: a module-evaluation error must never leave a
 * documentation demo stuck on its loading message.
 */
import {
  BASE_URL,
  ensureBuiltAndServed,
  launchBrowser,
  loadPlaywright,
  openPage,
  printReport,
  type CheckResult,
} from './test-utils';

async function main(): Promise<void> {
  const { stop } = await ensureBuiltAndServed();
  const browser = await launchBrowser(loadPlaywright());
  const results: CheckResult[] = [];
  const sandboxes = [
    '/sandbox/ui/component.html?name=text',
    '/sandbox/ui/button.html',
    '/sandbox/ui/markdown.html',
    '/sandbox/ui/overlay.html',
    '/sandbox/ui/slider.html',
  ];

  try {
    for (const sandbox of sandboxes) {
      const { page, pageErrors } = await openPage(browser);
      await page.goto(`${BASE_URL}${sandbox}`, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForTimeout(2_000);

      const state = await page.evaluate(() => {
        const status = document.querySelector('#status');
        const canvas = document.querySelector('#canvas') as HTMLCanvasElement | null;
        const error = document.querySelector('#error');
        return {
          ready: status?.classList.contains('ready') ?? false,
          error: error?.textContent?.trim() ?? '',
          canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'missing',
        };
      });

      results.push({
        name: `${sandbox}: reaches its ready signal`,
        pass: state.ready,
        detail: state.error || state.canvasSize,
      });
      results.push({
        name: `${sandbox}: has no uncaught errors`,
        pass: pageErrors.length === 0,
        detail: pageErrors.slice(0, 3).join(' | '),
      });
      await page.close();
    }

    const { page } = await openPage(browser);
    await page.goto(`${BASE_URL}/reference/ui-text/`, { waitUntil: 'load', timeout: 30_000 });
    const iframeSource = await page.evaluate(() =>
      document.querySelector('iframe[title="Text live demo"]')?.getAttribute('src'),
    );
    results.push({
      name: 'documentation pages invalidate previously cached sandbox documents',
      pass: iframeSource?.includes('v=ui-bundle-2') ?? false,
      detail: iframeSource ?? 'Text demo iframe not found',
    });
    await page.close();
  } finally {
    await browser.close();
    stop();
  }

  process.exit(printReport('UI component sandbox browser regression', results) ? 0 : 1);
}

void main();
