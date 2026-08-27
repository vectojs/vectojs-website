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

/**
 * Page-data JSON cache keyed by path. SPA navigations re-fetch + re-parse the
 * full HTML otherwise, which on a back/forward hop or a revisited page adds a
 * visible beat to the click; a capped Map keeps revisits instant and memory
 * bounded (~50KB of JSON per entry).
 */
const pageDataCache = new Map<string, unknown>();
const PAGE_DATA_CACHE_MAX = 24;

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

async function fetchPageData(url: string): Promise<unknown | null> {
  const cached = pageDataCache.get(url);
  if (cached !== undefined) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed ${res.status}`);
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const dataElement = doc.getElementById('page-data');
  if (!dataElement) return null;
  const raw = dataElement.textContent || '';
  const data = JSON.parse(raw);
  // Only cache when data is valid
  pageDataCache.set(url, data);
  if (pageDataCache.size > PAGE_DATA_CACHE_MAX) {
    const oldest = pageDataCache.keys().next().value;
    if (oldest !== undefined) pageDataCache.delete(oldest);
  }
  return data;
}

export async function handleUrlRoute(url: string): Promise<void> {
  const cached = pageDataCache.get(url);
  if (cached !== undefined) {
    _onPageData?.(cached);
    return;
  }
  try {
    const data = await fetchPageData(url);
    if (data === null) {
      console.warn(`[router] missing #page-data for ${url}, falling back to full navigation`);
      window.location.href = url;
      return;
    }
    _onPageData?.(data);
  } catch (e) {
    console.error('SPA navigation failed, reloading page…', e);
    window.location.href = url;
  }
}

export async function navigateTo(url: string): Promise<void> {
  // Page-to-page navigation resets the scroll position immediately (the old
  // DOM site's full reload did this for free). The async rebuild that follows
  // takes ~150ms; leaving the window scrolled to the old page's offset during
  // that gap reads as a broken wheel/page. Hash links keep their position.
  try {
    if (!url.includes('#') && window.scrollY > 0) {
      window.scrollTo(0, 0);
    }
  } catch {
    // scrollTo is a no-op in test environments
  }
  try {
    (window as unknown as { __navLog?: string[] }).__navLog?.push(
      `${new Error().stack?.split('\n')[2]?.trim() || '?'} -> ${url}`,
    );
  } catch {
    // debug aid only
  }
  // Resolve target URL without touching history yet — pushState must happen
  // only after the fetch succeeds, otherwise a missing #page-data would
  // desync history (blank page) and window.location.pathname would be stale
  // when renderApp reads it.
  let targetUrl: string | null = null;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (!isSameOrigin(parsed)) {
        window.location.href = url;
        return;
      }
      targetUrl = parsed.pathname + parsed.search + parsed.hash;
    } catch (e) {
      console.warn('Failed to parse URL in navigateTo:', e);
      targetUrl = url;
    }
  } else {
    targetUrl = url;
  }

  // Hash-only navigation: push immediately, no fetch needed (same document)
  if (targetUrl.includes('#') && targetUrl.split('#')[0] === window.location.pathname) {
    window.history.pushState({}, '', targetUrl);
    // Let browser handle hash scroll; still trigger route for completeness
    await handleUrlRoute(targetUrl.split('#')[0]);
    return;
  }

  // For SPA page navigation, fetch first, then pushState, then render.
  // This keeps history in sync and ensures window.location.pathname is
  // correct when renderApp parses it.
  try {
    const data = await fetchPageData(targetUrl);
    if (data === null) {
      console.warn(`[router] missing #page-data for ${targetUrl}, falling back to full navigation`);
      window.location.href = targetUrl;
      return;
    }
    window.history.pushState({}, '', targetUrl);
    _onPageData?.(data);
  } catch (e) {
    console.error('SPA navigation failed, reloading page…', e);
    window.location.href = targetUrl;
  }
}
