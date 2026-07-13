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
    '/sandbox/ui/component.html?name=richtext',
    '/sandbox/ui/component.html?name=codeblock',
    '/sandbox/ui/component.html?name=table',
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

    const { page: codePage, pageErrors: codePageErrors } = await openPage(browser);
    await codePage.goto(`${BASE_URL}/sandbox/ui/component.html?name=codeblock`, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await codePage.waitForTimeout(2_000);
    const codeProjection = await codePage.evaluate(() => {
      const expected = [
        'const office = "ffi affinity";',
        'const greeting = "مرحبا بك";',
        "scene.renderMode = 'onDemand';",
      ].join('\n');
      const root = [...document.querySelectorAll<HTMLElement>('[data-vecto-content]')].find(
        (element) => element.textContent === expected,
      );
      if (!root)
        return { found: false, copied: '', onlyPositionedRows: false, geometryInRows: false };

      const range = document.createRange();
      range.selectNodeContents(root);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const rowRects = [...root.children].map((child) => child.getBoundingClientRect());
      const fragments = [...range.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      const geometryInRows = fragments.every((fragment) =>
        rowRects.some(
          (row) =>
            fragment.bottom >= row.top - 1 &&
            fragment.top <= row.bottom + 1 &&
            fragment.right >= row.left - 1 &&
            fragment.left <= row.right + 1,
        ),
      );
      return {
        found: true,
        copied: selection?.toString() ?? '',
        onlyPositionedRows: [...root.childNodes].every(
          (node) => node.nodeType === Node.ELEMENT_NODE,
        ),
        geometryInRows,
      };
    });
    results.push({
      name: 'CodeBlock projection preserves ligatures, Arabic, and hard newlines',
      pass:
        codeProjection.found &&
        codeProjection.copied ===
          [
            'const office = "ffi affinity";',
            'const greeting = "مرحبا بك";',
            "scene.renderMode = 'onDemand';",
          ].join('\n'),
      detail: codeProjection.copied || 'projection not found',
    });
    results.push({
      name: 'CodeBlock multiline selection remains inside positioned row bands',
      pass: codeProjection.onlyPositionedRows && codeProjection.geometryInRows,
      detail: JSON.stringify(codeProjection),
    });
    results.push({
      name: 'CodeBlock consumer sandbox has no uncaught errors',
      pass: codePageErrors.length === 0,
      detail: codePageErrors.slice(0, 3).join(' | '),
    });
    await codePage.close();

    const { page: markdownPage } = await openPage(browser);
    await markdownPage.goto(`${BASE_URL}/sandbox/ui/markdown.html`, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await markdownPage.waitForTimeout(2_000);
    const markdownText = await markdownPage.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-vecto-content]')]
        .map((element) => element.textContent ?? '')
        .join('\n'),
    );
    results.push({
      name: 'Markdown projects selectable list and table descendants in logical order',
      pass:
        markdownText.includes('Logical source survives visual wrapping') &&
        markdownText.includes('Arabic stays ordered: مرحبا بك') &&
        markdownText.includes('office ffi') &&
        markdownText.includes('logical RTL'),
      detail: markdownText.slice(0, 600),
    });
    await markdownPage.close();

    const { page: tablePage } = await openPage(browser);
    await tablePage.goto(`${BASE_URL}/sandbox/ui/component.html?name=table`, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await tablePage.waitForTimeout(2_000);
    const tableCells = await tablePage.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-vecto-content]')].map(
        (element) => element.textContent ?? '',
      ),
    );
    results.push({
      name: 'Table projects each ligature and RTL sample cell once',
      pass:
        tableCells.filter((value) => value === 'office ffi').length === 1 &&
        tableCells.filter((value) => value === 'مرحبا Table').length === 1,
      detail: tableCells.join(' | '),
    });
    await tablePage.close();

    const { page } = await openPage(browser);
    await page.goto(`${BASE_URL}/reference/ui-text/`, { waitUntil: 'load', timeout: 30_000 });
    const iframeSource = await page.evaluate(() =>
      document.querySelector('iframe[title="Text live demo"]')?.getAttribute('src'),
    );
    results.push({
      name: 'documentation pages invalidate previously cached sandbox documents',
      pass: iframeSource?.includes('v=ui-bundle-3') ?? false,
      detail: iframeSource ?? 'Text demo iframe not found',
    });
    await page.close();
  } finally {
    await browser.close();
    stop();
  }

  process.exitCode = printReport('UI component sandbox browser regression', results) ? 0 : 1;
}

void main();
