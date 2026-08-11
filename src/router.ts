/**
 * SPA router for VectoJS website.
 *
 * All navigation flows through `navigateTo()`. `handleUrlRoute()` fetches the
 * HTML, extracts the `#page-data` JSON, stores it, and calls the
 * `onPageData` callback so the render layer can react without a circular import.
 */

/** Callback registered by the app layer; called whenever new page data arrives. */
type PageDataCallback = (data: unknown) => void;

let _onPageData: PageDataCallback | null = null;

/** Register the function that the app should call when a new page loads. */
export function setPageDataCallback(cb: PageDataCallback): void {
  _onPageData = cb;
}

function isSameOrigin(parsedUrl: URL): boolean {
  const host = parsedUrl.hostname;
  const currentHost = window.location.hostname;
  if (host === currentHost) return true;
  const domains = ['vectojs.org', 'localhost', '127.0.0.1'];
  const isTarget = domains.includes(host) || host.endsWith('vectojs.pages.dev');
  const isCurrent = domains.includes(currentHost) || currentHost.endsWith('vectojs.pages.dev');
  return isTarget && isCurrent;
}

export async function handleUrlRoute(url: string): Promise<void> {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const dataElement = doc.getElementById('page-data');
    if (dataElement) {
      const raw = dataElement.textContent || '';
      const data = JSON.parse(raw);
      _onPageData?.(data);
    }
  } catch (e) {
    console.error('SPA navigation failed, reloading page…', e);
    window.location.href = url;
  }
}

export async function navigateTo(url: string): Promise<void> {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (!isSameOrigin(parsed)) {
        window.location.href = url;
        return;
      }
      const targetUrl = parsed.pathname + parsed.search + parsed.hash;
      window.history.pushState({}, '', targetUrl);
      await handleUrlRoute(targetUrl);
      return;
    } catch (e) {
      console.warn('Failed to parse URL in navigateTo:', e);
    }
  }
  window.history.pushState({}, '', url);
  await handleUrlRoute(url);
}
