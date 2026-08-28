import { Scene, type Entity, type IRenderer } from '@vectojs/core';
import { Card, Stack, Text } from '@vectojs/ui';

import { withWholeLineProjection } from './text-utils';
import { Container, DividerLine, fillRect, PageContainer } from './entities';
import {
  applyWebsiteTheme,
  resolveThemeColors,
  resolveLayoutMetrics,
  websiteThemeName,
  LAYOUT,
} from './theme';
import { createNavbar, registerSearchShortcut, type ActiveSection } from './nav';
import { buildHeroSection } from './hero';
import { buildHomeSections } from './home';
import { TocSidebar, MobileToc, type TocEntry } from './toc';
import {
  buildMobileDocsPanel,
  buildSidebar,
  buildSidebarExpandButton,
  SIDEBAR_WIDTH,
  sidebarCollapsed,
  setSidebarCollapsed,
} from './sidebar';
import { navigateTo, handleUrlRoute, setPageDataCallback } from './router';
import { parseLocale, type Locale } from './i18n/config';
import { useTranslations } from './i18n/ui';
import { normalizeTranslationTargets } from './i18n/language-target';
import { getHomeStrings } from './i18n/home';

// withWholeLineProjection MUST be applied to every Text/RichText entity.
//
// VectoJS projects plain text as per-grapheme inline-block carriers by default
// so DOM selection rectangles track fractional canvas glyph positions (Gecko
// grid-fits integer device pixels). The downside is that carrier widths are
// computed from `lineFont = nodeFont(undefined, largest)`, which does not
// include span-level bold/italic — a bold span measured with a non-bold lineFont
// gets near-zero space carriers and words appear concatenated, and selection
// highlights drift from the painted glyphs in Firefox.
//
// withWholeLineProjection sets perGraphemeCarriers=false on every projected line,
// emitting one whole-line text node per visual line instead. The DOM selection
// then covers a full line at a time (acceptable for a doc site), and the lineFont
// mismatch is irrelevant because no per-grapheme widths are measured.
// Cost: selection rectangles may drift 1-2px over a very long line in Firefox.
// That is the intended trade-off, and is exactly what xuepoo-blog uses throughout.

// ─── Global State ──────────────────────────────────────────────────────────────

let currentScene: Scene | null = null;
let currentPageData: unknown = null;
let scrollListenersAttached = false;
let currentMainScroll: Container | null = null;
let lastDpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
let heroStop: (() => void) | null = null;
let syncScrollIntervalId: ReturnType<typeof setInterval> | null = null;
let mdHeightPollId: ReturnType<typeof setInterval> | null = null;
let mdHeightPollTimeoutId: ReturnType<typeof setTimeout> | null = null;

function themeName(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** Drop a leading `# Title` from an article body (title renders separately). */
function stripLeadingH1(md: string): string {
  if (md.startsWith('# ')) {
    const nl = md.indexOf('\n');
    return nl === -1 ? '' : md.slice(nl + 1);
  }
  return md;
}

interface BlogCardPage {
  title: string;
  description?: string;
  path: string;
  date?: string;
  tags?: string[];
  author?: string;
}

/**
 * One blog post card: meta line, title, description, tag pills, read link.
 * Composed from `Card` + `Stack` so the whole card is one clickable region
 * with a proper accessible name and a projected box that matches the paint.
 */
function buildBlogCard(
  parent: Container,
  page: BlogCardPage,
  opts: {
    colors: ReturnType<typeof resolveThemeColors>;
    contentX: number;
    innerW: number;
  },
  topY: number,
): number {
  const { colors, contentX, innerW } = opts;
  const pad = 24;
  const contentW = innerW - pad * 2;

  const stack = new Stack({ direction: 'vertical', gap: 10 });

  const metaParts: string[] = [];
  if (page.date) {
    metaParts.push(
      new Date(`${page.date}T00:00:00Z`).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }),
    );
  }
  if (page.author) metaParts.push(page.author);
  if (metaParts.length) {
    stack.add(
      new Text(metaParts.join(' · '), {
        font: '12.8px Inter, sans-serif',
        color: colors.faint,
      }),
    );
  }

  stack.add(
    withWholeLineProjection(
      new Text(page.title, {
        font: '600 20px Outfit, sans-serif',
        color: colors.text,
        maxWidth: contentW,
      }),
    ),
  );

  if (page.description) {
    stack.add(
      withWholeLineProjection(
        new Text(page.description, {
          font: '14.4px Inter, sans-serif',
          color: colors.muted,
          maxWidth: contentW,
          lineHeight: 22,
        }),
      ),
    );
  }

  if (page.tags?.length) {
    const tagRow = new Stack({ direction: 'horizontal', gap: 8 });
    for (const tag of page.tags.slice(0, 4)) {
      const label = new Text(tag, {
        font: '600 11.5px Inter, sans-serif',
        color: colors.primary,
      });
      const pill = new Card({
        width: label.width + 18,
        height: label.height + 8,
        bg: 'rgba(99,102,241,0.12)',
        radius: 999,
      });
      label.x = 9;
      label.y = 4;
      pill.add(label);
      tagRow.add(pill);
    }
    stack.add(tagRow);
  }

  stack.add(
    new Text('Read post →', {
      font: '600 13px Inter, sans-serif',
      color: colors.accent,
    }),
  );

  const card = new Card({
    width: innerW,
    height: stack.height + pad * 2,
    bg: colors.bgCard,
    border: colors.divider,
    borderWidth: 1,
    radius: LAYOUT.cardRadius,
    padding: pad,
    label: page.title,
    onClick: () => navigateTo(page.path),
  });
  card.x = contentX;
  card.y = topY;
  parent.add(card);

  stack.x = contentX + pad;
  stack.y = topY + pad;
  parent.add(stack);

  return topY + card.height + 20;
}

/** Flip `data-theme` + localStorage, then rebuild the whole page. */
function flipTheme(): void {
  const next = themeName() === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('vecto-theme', next);
  } catch {
    // private browsing / storage disabled — theme still applies this session
  }
  applyWebsiteTheme(next);
  void renderApp();
}

// ─── Responsive Layout ─────────────────────────────────────────────────────────

async function handleResize(): Promise<void> {
  // Save scroll position and ratio for proportional restore
  const prevScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
  const maxScrollY =
    typeof document !== 'undefined'
      ? Math.max(1, document.body.scrollHeight - window.innerHeight)
      : 1;
  const scrollRatio = prevScrollY / maxScrollY;
  const handleStartGeneration = renderGeneration;

  // DPR-only path (monitor move, CDP emulation) doesn't go through the
  // ResizeObserver's resize, so ensure the backing store is correctly sized
  // before the rebuild — otherwise the canvas stays at the old DPR and blurs,
  // and a failing resize would leave the scene blank. Guard NaN/Infinity and
  // zero so a transient 0-height (mobile URL bar) doesn't zero the viewport.
  try {
    if (currentScene) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        currentScene.resize(w, h);
        try {
          currentScene.render(currentScene.getRenderer(), 0, performance.now());
        } catch {}
      }
    }
  } catch (err) {
    console.warn('[website] DPR pre-resize failed', err);
  }

  // Always do a full rebuild (matches xuepoo-blog pattern)
  try {
    await renderApp();
  } catch (err) {
    console.error('[website] renderApp failed during resize', err);
    // Fallback: ensure at least a repaint so the canvas isn't left cleared
    try {
      currentScene?.markDirty();
      if (currentScene) currentScene.render(currentScene.getRenderer(), 0, performance.now());
    } catch {}
    return;
  }

  // If a navigation started while the rebuild was in flight, the scroll
  // restore would overwrite its `scrollTo(0,0)` and leave the new page at the
  // old page's offset (blank). Skip restore when generation advanced past this
  // handleResize's own renderApp.
  if (renderGeneration !== handleStartGeneration + 1) return;

  // Restore scroll position proportionally after rebuild
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    requestAnimationFrame(() => {
      // A second navigation may have started while this rAF was queued.
      if (renderGeneration !== handleStartGeneration + 1) return;
      try {
        const newMaxScrollY = Math.max(1, document.body.scrollHeight - window.innerHeight);
        let targetScrollY = prevScrollY;

        // Use proportional restore if content height changed significantly
        if (Math.abs(maxScrollY - newMaxScrollY) > 1) {
          targetScrollY = scrollRatio * newMaxScrollY;
        }

        window.scrollTo(0, targetScrollY);
        if (currentMainScroll) {
          currentMainScroll.y = -window.scrollY;
        }
        currentScene?.markDirty();
        // Previously a `setTimeout(360)` forced `window.scrollTo(0,maxAfter)`
        // here to keep the bottom reachable after a late reflow. That forced
        // `scrollTo` fought the browser's APZ scrollbar transaction when the
        // user was mid-drag (the thumb at old `maxScrollY` vs new `maxAfter`),
        // leaving the page visually stuck. Replace with a passive sync: the
        // browser naturally clamps `scrollY` on its next frame if it is truly
        // beyond the new max; we only need to keep `mainScroll.y` in sync.
        requestAnimationFrame(() => {
          try {
            if (renderGeneration !== handleStartGeneration + 1) return;
            if (currentMainScroll) currentMainScroll.y = -window.scrollY;
            currentScene?.markDirty();
          } catch {}
        });
      } catch (err) {
        console.warn('[website] scroll restore failed', err);
      }
    });
  }
}

// ─── Main Render ───────────────────────────────────────────────────────────────

function clearScene(scene: Scene): void {
  const root = (scene as unknown as { root?: { children?: Entity[] } }).root;
  if (!root?.children) return;
  for (const kid of [...root.children]) {
    try {
      scene.remove(kid);
      const destroySubtree = (node: unknown): void => {
        const children = (node as { children?: unknown[] }).children;
        if (children) {
          for (const c of [...children]) destroySubtree(c);
        }
        if (typeof (node as { destroy?: unknown }).destroy === 'function') {
          (node as { destroy: () => void }).destroy();
        }
      };
      destroySubtree(kid);
    } catch {
      // One entity's destroy() must not stop the sweep — a stuck subtree
      // would accumulate duplicates on the next renderApp (e.g. TocSidebar).
    }
  }
}

/** Generation counter for renderApp: a newer call supersedes an in-flight one. */
let renderGeneration = 0;

async function renderApp(): Promise<void> {
  if (!currentScene || !currentPageData) return;
  const generation = ++renderGeneration;

  // Clear previous article height poll — each navigation creates its own poll
  // for `retypesetFromTokens`; without clearing the old one, rapid navigations
  // stack multiple 100 ms timers that each call `reflowBelowMd` with a stale
  // `md` closure and fight the new page's layout. Cleared here (before any
  // async work) so a bail after the preload does not leave the old poll alive.
  if (mdHeightPollId !== null) {
    clearInterval(mdHeightPollId);
    mdHeightPollId = null;
  }
  if (mdHeightPollTimeoutId !== null) {
    clearTimeout(mdHeightPollTimeoutId);
    mdHeightPollTimeoutId = null;
  }
  // Note: `syncScrollIntervalId` is cleared at creation time (after the scene
  // is built), not here — clearing it before the async `createArticleMarkdown`
  // would leave a gap with no sync if this generation bails before reaching
  // the creation site.

  // Every rebuild must resync the styles-layer theme with data-theme: rebuilds
  // triggered by popstate (language switch) or resize would otherwise keep the
  // previous theme's resolved colors (navbar/links/cards built with stale hues).
  applyWebsiteTheme(websiteThemeName());

  if (heroStop) {
    heroStop();
    heroStop = null;
  }

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const { width, contentWidth, originX, isMobile } = resolveLayoutMetrics(viewportW);
  const colors = resolveThemeColors();
  const payload = currentPageData as {
    config?: { title?: string };
    data?: {
      type?: string;
      title?: string;
      lang?: string;
      raw_content?: string;
      toc?: TocEntry[];
      pages?: {
        title: string;
        description?: string;
        path: string;
        date?: string;
      }[];
      translations?: { lang: string; permalink: string }[];
      navigation?: {
        earlier?: { title: string; path: string } | null;
        later?: { title: string; path: string } | null;
      };
    };
  };
  const { locale } = parseLocale(window.location.pathname);
  const lang: Locale = locale;
  const t = useTranslations(lang);
  const pageTitle = payload.data?.title;
  document.title = pageTitle ? `${pageTitle} · VectoJS` : (payload.config?.title ?? 'VectoJS');
  const type = payload.data?.type ?? 'page';
  const rest = parseLocale(window.location.pathname).rest;
  const active: ActiveSection =
    rest.split('/')[1] === 'learn'
      ? 'learn'
      : rest.split('/')[1] === 'reference'
        ? 'reference'
        : rest.split('/')[1] === 'blog'
          ? 'blog'
          : 'home';

  // For article pages, pre-fetch markdown before clearing to keep previous
  // content visible during the async import/parse. This prevents the
  // generation-race blank where clearScene ran before await createArticleMarkdown
  // and a stale generation bailed without ever setting body height.
  let preloadedMd: any = null;
  if (type !== 'home' && type !== 'section') {
    const sidebarPagesPre = (payload.data as any)?.sidebar as
      | { title: string; path: string }[]
      | undefined;
    const hasSidebarPre = Array.isArray(sidebarPagesPre) && sidebarPagesPre.length > 0;
    const contentOffsetPre = hasSidebarPre && !isMobile ? SIDEBAR_WIDTH + 32 : 0;
    const contentXPre = hasSidebarPre && !isMobile ? 20 + contentOffsetPre : originX;
    const articleWidthPre =
      hasSidebarPre && !isMobile
        ? Math.min(contentWidth, Math.max(480, viewportW - contentXPre - 240 - 80))
        : contentWidth;
    const rawPre = stripLeadingH1(payload.data?.raw_content ?? '');
    try {
      const { createArticleMarkdown } = await import('./article');
      const mdPre = await createArticleMarkdown(rawPre, {
        locale: lang,
        maxWidth: articleWidthPre,
        theme: {
          bodyFont: 'Inter, sans-serif',
          codeFont: 'monospace',
          textColor: colors.text,
          headingColor: colors.heading,
          linkColor: colors.accent,
          codeColor: colors.codeText,
          codeBgColor: colors.codeBg,
          codeBorderColor: colors.borderStrong,
          quoteBorderColor: colors.quoteBorder,
          quoteTextColor: colors.muted,
          hrColor: colors.divider,
          tableBgColor: colors.bgCard,
          tableHeaderBgColor: 'rgba(99,102,241,0.08)',
          syntaxKeywordColor: colors.syntaxKeyword,
          syntaxStringColor: colors.syntaxString,
          syntaxCommentColor: colors.syntaxComment,
          syntaxNumberColor: colors.syntaxNumber,
          fontSize: isMobile ? 16 : 18,
        },
        blockAffordances: true,
        showCodeLanguage: true,
        affordances: { table: { copy: false, download: false } },
        onLinkClick: (url: string) => navigateTo(url),
      });
      if (generation !== renderGeneration) return;
      preloadedMd = mdPre;
    } catch (e) {
      console.warn('[website] preload markdown failed', e);
      if (generation !== renderGeneration) return;
    }
  }

  // Now that any async work is done and generation is still current, clear
  // the previous scene. Double-check generation before and after clear so a
  // newer navigation that started during the async fetch does not get wiped.
  if (generation !== renderGeneration) return;
  clearScene(currentScene);
  if (generation !== renderGeneration) return;

  // ── page background (scene-root layer below everything, fixed to the viewport) ─
  // Light mode carries the old site's three pastel radial washes (mint/pink/
  // cyan); dark mode is the plain near-black blue. Drawn with concentric
  // circles because the renderer only offers linear gradients.
  const bgLayer = new (class extends Container {
    render(r: IRenderer): void {
      fillRect(r, 0, 0, viewportW, viewportH, colors.bg);
      if (themeName() !== 'light') return;
      // Astro parity (styles.css): a radial glow peaks at its center and fades
      // to transparent at 60% of its radius, then stops. The ring approximation
      // draws smallest-first so the composite peaks in the middle instead of at
      // the rim (the old largest-first order painted a bright ring).
      const glow = (cx: number, cy: number, radius: number, rgb: string, peak: number): void => {
        const fade = radius * 0.6;
        for (let i = 0; i < 24; i++) {
          const t = i / 24;
          r.beginPath();
          r.arc(cx, cy, fade * t, 0, Math.PI * 2);
          r.fill(`rgba(${rgb},${(peak * (1 - t)).toFixed(3)})`);
        }
      };
      glow(viewportW * 0.08, -viewportH * 0.08, 1100, '191,253,224', 0.55);
      glow(viewportW * 1.0, viewportH * 0.08, 1000, '254,230,251', 0.5);
      glow(viewportW * 0.45, viewportH * 1.02, 900, '180,254,254', 0.4);
    }
  })();
  bgLayer.isPointInside = () => false;
  currentScene.add(bgLayer);

  // ── scroll container (added before the navbar so the nav draws on top) ──────
  const mainScroll = new Container();
  currentMainScroll = mainScroll;
  // No y transition: scroll sync must be instant. A transition needs the
  // entity update loop, which an onDemand scene only drives while something
  // marks it dirty — so a slow scroll left mainScroll.y frozen mid-animation
  // (observed: scrollY 2937 while mainScroll.y sat at -957).
  currentScene.add(mainScroll);

  if (!scrollListenersAttached) {
    scrollListenersAttached = true;
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    window.addEventListener(
      'scroll',
      () => {
        if (currentMainScroll) {
          currentMainScroll.y = -window.scrollY;
          currentScene?.markDirty();
        }
      },
      { passive: true },
    );
  }
  // Fallback sync: APZ may coalesce scroll events or deliver them late
  // when the onDemand scene is idle, leaving mainScroll.y behind window.scrollY
  // (observed freeze at bottom: scrollY 6677 while mainScroll sat at 0). Poll
  // window.scrollY and sync immediately. Use setInterval, not rAF, because
  // rAF is throttled to ~2 FPS when the onDemand scene is idle.
  // Recreated per generation so stale closures do not accumulate after SPA
  // navigations; cleared here (just before creating the new one) so a bail
  // before this point does not leave a gap with no active sync.
  {
    if (syncScrollIntervalId !== null) {
      clearInterval(syncScrollIntervalId);
      syncScrollIntervalId = null;
    }
    let lastWindowScrollY = window.scrollY;
    const syncScrollFrame = () => {
      if (generation !== renderGeneration) return;
      if (currentMainScroll) {
        if (window.scrollY !== lastWindowScrollY || currentMainScroll.y !== -window.scrollY) {
          lastWindowScrollY = window.scrollY;
          currentMainScroll.y = -window.scrollY;
          currentScene?.markDirty();
        }
      } else {
        lastWindowScrollY = window.scrollY;
      }
    };
    syncScrollIntervalId = setInterval(syncScrollFrame, 16);
  }

  // ── fixed navbar (scene root, drawn above the scrolling content) ────────────
  createNavbar(currentScene, {
    colors,
    lang,
    active,
    viewportWidth: viewportW,
    isMobile,
    translationTargets: normalizeTranslationTargets(payload.data?.translations),
    onThemeChange: () => flipTheme(),
    onNavigate: (url: string) => navigateTo(url),
  });

  if (typeof window !== 'undefined') {
    (window as any).currentScene = currentScene;
    (window as any).mainScroll = mainScroll;
  }

  let currentY = LAYOUT.navHeight;

  // ── content ─────────────────────────────────────────────────────────────────
  if (type === 'home') {
    // Hero (neural field + serif title + CTAs + stats card)
    const heroH = Math.round(viewportH * LAYOUT.heroMinHeight);
    heroStop = buildHeroSection({
      scene: mainScroll,
      width: width,
      height: heroH,
      title: getHomeStrings(lang).hero.title,
      galleryLabel: getHomeStrings(lang).hero.gallery,
      galleryUrl: payload.config?.gallery || 'https://gallery.vectojs.org',
    });
    currentY += heroH;

    // Hero bottom border
    const heroDivider = new DividerLine(width, colors.divider);
    heroDivider.setPosition(0, currentY);
    mainScroll.add(heroDivider);
    currentY += 1;

    const containerW = Math.min(viewportW, LAYOUT.containerMax);
    const contentX = (viewportW - containerW) / 2 + LAYOUT.containerPad;
    const innerW = containerW - LAYOUT.containerPad * 2;

    currentY = buildHomeSections(
      mainScroll,
      { lang, colors, contentX, innerW, isMobile },
      currentY,
    );

    const footerTop = await buildFooter(
      mainScroll,
      t('footer.copyright'),
      colors,
      innerW,
      contentX,
      currentY + LAYOUT.footerMarginTop,
    );
    if (generation !== renderGeneration) return;
    currentY = footerTop + 96;
  } else if (type === 'section') {
    const containerW = Math.min(viewportW, LAYOUT.containerMax);
    const contentX = (viewportW - containerW) / 2 + LAYOUT.containerPad;
    const innerW = containerW - LAYOUT.containerPad * 2;
    const isBlog = rest.startsWith('/blog/');

    const title = new Text(payload.data?.title || '', {
      font: '800 40px Outfit, sans-serif',
      color: colors.strong,
    });
    title.x = contentX;
    title.y = currentY + LAYOUT.sectionPad;
    mainScroll.add(title);
    currentY += LAYOUT.sectionPad + title.height + 24;

    if (payload.data?.description) {
      const lede = new Text(payload.data.description, {
        font: '16.8px Inter, sans-serif',
        color: colors.muted,
        maxWidth: innerW * 0.7,
        lineHeight: 26,
      });
      lede.x = contentX;
      lede.y = currentY;
      mainScroll.add(lede);
      currentY += lede.height + 48;
    }

    for (const page of payload.data?.pages ?? []) {
      if (isBlog) {
        currentY = buildBlogCard(mainScroll, page, { colors, contentX, innerW }, currentY);
      } else {
        const row = new Container();
        row.x = contentX;
        row.y = currentY;
        row.width = innerW;
        row.height = 96;
        row.interactive = true;
        row.on('click', () => navigateTo(page.path));
        const rowTitle = withWholeLineProjection(
          new Text(page.title, {
            font: '600 17px Inter, sans-serif',
            color: colors.text,
          }),
        );
        rowTitle.x = 0;
        rowTitle.y = 12;
        row.add(rowTitle);
        if (page.description) {
          const desc = withWholeLineProjection(
            new Text(page.description, {
              font: '14px Inter, sans-serif',
              color: colors.muted,
              maxWidth: innerW - 60,
            }),
          );
          desc.x = 0;
          desc.y = rowTitle.y + rowTitle.height + 8;
          row.add(desc);
        }
        const chevron = new Text('→', {
          font: '18px Inter, sans-serif',
          color: colors.accent,
        });
        chevron.x = innerW - 30;
        chevron.y = 34;
        row.add(chevron);
        const rowDivider = new DividerLine(innerW, colors.divider);
        rowDivider.y = 95;
        row.add(rowDivider);
        mainScroll.add(row);
        currentY += 96;
      }
    }

    const footerTop = await buildFooter(
      mainScroll,
      t('footer.copyright'),
      colors,
      innerW,
      contentX,
      currentY + LAYOUT.footerMarginTop,
    );
    if (generation !== renderGeneration) return;
    currentY = footerTop + 96;
  } else {
    // Article page. Start below the fixed navbar plus a breathing gap so the
    // title's ascenders are never clipped behind it.
    const sidebarPages = (payload.data?.sidebar ?? []) as {
      title: string;
      path: string;
    }[];
    const hasSidebar = sidebarPages.length > 0;

    // When docs sidebar is present, content starts after the sidebar width.
    // When collapsed, we render a narrow expand button but content still gets
    // the full offset so layout stays stable across toggle. On mobile the
    // sidebar is never mounted at all — the in-article Docs trigger opens the
    // page list as an overlay instead (the old site's drawer).
    let contentOffset = 0;
    if (hasSidebar && !isMobile) {
      contentOffset = SIDEBAR_WIDTH + 32;
      // The collapse/expand toggle swaps ONLY the sidebar subtree. The article
      // column keeps the same offset in both states (layout is stable across
      // the toggle), so a full renderApp() would be pure waste — and a visible
      // one: it re-parses the whole article markdown and rebuilds the navbar,
      // whose logo Image loads its SVG data URL asynchronously, flashing the
      // placeholder box where the logo sits on every toggle.
      const sidebarScene = currentScene;
      let sidebarRoot: Entity | null = null;
      const mountSidebar = (): void => {
        if (sidebarRoot) {
          sidebarScene.remove(sidebarRoot);
          sidebarRoot.destroy();
          sidebarRoot = null;
        }
        if (!sidebarCollapsed(isMobile)) {
          sidebarRoot = buildSidebar(sidebarScene, {
            colors,
            lang,
            pages: sidebarPages,
            activePath: payload.data?.path ?? '',
            viewportWidth: viewportW,
            viewportHeight: viewportH,
            onNavigate: (url: string) => navigateTo(url),
            onToggle: () => {
              setSidebarCollapsed(true);
              mountSidebar();
              onSidebarToggled();
            },
          });
        } else {
          // Collapsed: a narrow expand button at the left edge instead.
          sidebarRoot = buildSidebarExpandButton(sidebarScene, {
            colors,
            lang,
            viewportHeight: viewportH,
            onExpand: () => {
              setSidebarCollapsed(false);
              mountSidebar();
              onSidebarToggled();
            },
          });
        }
        sidebarScene.markDirty();
      };
      mountSidebar();
    }

    // Content column uses a fixed left origin when sidebar is present,
    // or centers when no sidebar (e.g. blog posts, mobile).
    const contentX = hasSidebar && !isMobile ? 20 + contentOffset : originX;
    // The generic contentWidth (up to 1024) is derived from the full viewport
    // and does not know a 240px sidebar is pinned left. On a ~1440-1600px
    // screen that pushes tocX past the viewport edge, so the desktop TOC
    // never fit and always degraded to the inline MobileToc. Cap the article
    // column so sidebar + article + TOC (240) + margins (80) all fit;
    // floor at 480 so narrow-but-not-mobile windows stay readable (the TOC
    // check below then hides the TOC instead of crushing the article).
    const articleWidth =
      hasSidebar && !isMobile
        ? Math.min(contentWidth, Math.max(480, viewportW - contentX - 240 - 80))
        : contentWidth;
    const page = new PageContainer();
    page.setPosition(contentX, currentY + 40);
    mainScroll.add(page);
    let detailY = 0;
    let footerContainer: Container | null = null;

    const pageTitle = withWholeLineProjection(
      new Text(payload.data?.title || 'Untitled', {
        font: `800 ${isMobile ? 32 : 40}px Outfit, sans-serif`,
        color: colors.strong,
        maxWidth: articleWidth,
      }),
    );
    pageTitle.setPosition(0, detailY);
    page.add(pageTitle);
    detailY += pageTitle.height + 24;

    if (payload.data?.date) {
      const dateText = withWholeLineProjection(
        new Text(payload.data.date, {
          font: '14px Inter, sans-serif',
          color: colors.faint,
        }),
      );
      dateText.setPosition(0, detailY);
      page.add(dateText);
      detailY += dateText.height + 24;
    }

    // Mobile has no fixed sidebar; offer a Docs trigger that opens the
    // section's page list as an overlay panel.
    if (isMobile && sidebarPages.length > 0) {
      const docsBtn = new Text(`☰ ${t('nav.learn')}`, {
        font: '600 14px Inter, sans-serif',
        color: colors.accent,
      });
      docsBtn.x = 0;
      docsBtn.y = detailY;
      docsBtn.interactive = true;
      docsBtn.getA11yAttributes = () => ({
        role: 'button',
        label: t('nav.learn'),
      });
      docsBtn.on('click', () => {
        buildMobileDocsPanel(currentScene, {
          colors,
          lang,
          pages: sidebarPages,
          activePath: window.location.pathname,
          onNavigate: (url: string) => navigateTo(url),
        });
      });
      page.add(docsBtn);
      detailY += docsBtn.height + 20;
    }

    const toc: TocEntry[] = payload.data?.toc ?? [];
    const showToc = toc.length > 0;
    const tocSidebarWidth = 240;
    // The TOC clears the article column's right edge; with a docs sidebar the
    // article already starts at contentOffset, so the TOC needs viewport room
    // for sidebar + article + TOC + margins. On narrower screens it falls back
    // to the mobile TOC.
    const tocX = contentX + articleWidth + 40;
    const showDesktopToc = showToc && !isMobile && tocX + tocSidebarWidth <= viewportW;
    let mobileToc: MobileToc | null = null;

    const navigateToHeading = { fn: (_flatIndex: number) => {} };
    const onTocNavigate = (flatIndex: number) => navigateToHeading.fn(flatIndex);

    if (showToc && !showDesktopToc) {
      mobileToc = new MobileToc(toc, articleWidth, onTocNavigate, lang, colors);
      mobileToc.setPosition(0, detailY);
      page.add(mobileToc);
      detailY += mobileToc.height + 24;
    }

    // The page title is rendered above; drop the document's own leading H1
    // (every article starts with `# <title>`) so it doesn't render twice.
    // Use preloaded markdown if available (fetched before clearScene to avoid
    // generation-race blank); otherwise fall back to inline fetch for edge cases
    // where type was mis-detected or preload failed.
    let md: any;
    if (preloadedMd) {
      md = preloadedMd;
      if (generation !== renderGeneration) return;
    } else {
      const raw = stripLeadingH1(payload.data?.raw_content ?? '');
      const { createArticleMarkdown } = await import('./article');
      md = await createArticleMarkdown(raw, {
        locale: lang,
        maxWidth: articleWidth,
        theme: {
          bodyFont: 'Inter, sans-serif',
          codeFont: 'monospace',
          textColor: colors.text,
          headingColor: colors.heading,
          linkColor: colors.accent,
          codeColor: colors.codeText,
          codeBgColor: colors.codeBg,
          codeBorderColor: colors.borderStrong,
          quoteBorderColor: colors.quoteBorder,
          quoteTextColor: colors.muted,
          hrColor: colors.divider,
          tableBgColor: colors.bgCard,
          tableHeaderBgColor: 'rgba(99,102,241,0.08)',
          syntaxKeywordColor: colors.syntaxKeyword,
          syntaxStringColor: colors.syntaxString,
          syntaxCommentColor: colors.syntaxComment,
          syntaxNumberColor: colors.syntaxNumber,
          fontSize: isMobile ? 16 : 18,
        },
        blockAffordances: true,
        showCodeLanguage: true,
        // Tables already sit inside a content flow where a copy control would
        // overlap the header row; code blocks keep their copy/download controls.
        affordances: { table: { copy: false, download: false } },
        onLinkClick: (url: string) => {
          // Links in markdown are already localized by createArticleMarkdown,
          // so just navigate directly. External URLs pass through unchanged.
          navigateTo(url);
        },
      });
      // A newer renderApp (fonts.ready, resize, popstate) may have rebuilt the
      // tree while the markdown worker was parsing — attaching this late entity
      // would duplicate it into the fresh tree.
      if (generation !== renderGeneration) return;
    }
    md.setPosition(0, detailY);
    page.add(md);
    detailY += md.height + 24;

    // The desktop TOC is created and swapped through a local mount function
    // rather than constructed inline: toggling the left docs sidebar swaps
    // that sidebar's subtree in place, and the old TocSidebar entity stops
    // painting after the swap (its rows' RichText glyphs no longer reach the
    // canvas even though the scene tree keeps them). Rebuilding ONLY the TOC
    // entity restores it without re-parsing the article — verified live:
    // a full rebuild after the toggle renders the TOC again (resize test),
    // and the failure follows the stale entity, not the renderer (direct
    // renderer draws still paint while the entity is blank).
    let currentTocSidebar: TocSidebar | null = null;
    // Captured once: `currentY` keeps advancing as the article branch builds
    // the footer, so a later toggle must not re-read it for the mount spot.
    const tocMountY = currentY + md.y;
    const mountToc = (): void => {
      if (currentTocSidebar) {
        currentScene.remove(currentTocSidebar);
        currentTocSidebar.destroy();
        currentTocSidebar = null;
      }
      if (!showDesktopToc) return;
      currentTocSidebar = new TocSidebar(toc, tocSidebarWidth, onTocNavigate, lang, colors);
      // The article column already sits right of the docs sidebar when one is
      // shown; the TOC must clear the article's right edge, not the page's.
      currentTocSidebar.setPosition(tocX, tocMountY);
      currentScene.add(currentTocSidebar);
      currentScene.markDirty();
    };
    mountToc();

    // The sidebar toggle swaps the docs sidebar in place; refresh the TOC
    // alongside it so its entries keep painting (see mountToc's note).
    const onSidebarToggled = (): void => {
      mountToc();
    };

    navigateToHeading.fn = (flatIndex: number) => {
      if (typeof window === 'undefined') return;
      // CTX-0037 (PX-0089/0090): `page.toc` is 2-level (h1 children h2; see
      // `templates/page.html:15` loops `for h1 in page.toc` then `for h2 in
      // h1.children`). `TrackedMarkdown.headingEntities` is now filtered to
      // depth<=2, but `stripLeadingH1` still removes the leading H1 from the
      // markdown (pageTitle renders separately), while `page.toc` keeps it as
      // flatIndex 0. After the filter, md.headingEntities contains only the
      // H2s (and any non-leading H1s) in doc order; flatIndex 0 must map to
      // `pageTitle`, flatIndex 1.. to `headingEntities[flatIndex-1]`. Detect
      // the stripped-leading-H1 case by the +1 length mismatch and a title
      // match so docs without a leading H1 (or future 3-level TOC) keep a
      // direct zip.
      const headings = md.headingEntities as Entity[];
      const tocFlatLength = toc.reduce((n, h1) => n + 1 + (h1.children?.length ?? 0), 0);
      const firstTocTitle = toc[0]?.title;
      const pageTitleText = payload.data?.title;
      const hasStrippedLeadingH1 =
        headings.length + 1 === tocFlatLength && firstTocTitle === pageTitleText;
      let target: Entity | undefined;
      if (hasStrippedLeadingH1) {
        if (flatIndex === 0) target = pageTitle as unknown as Entity;
        else target = headings[flatIndex - 1];
      } else {
        target = headings[flatIndex];
        if (!target && flatIndex > 0 && headings.length + 1 === tocFlatLength) {
          target = headings[flatIndex - 1];
        }
      }
      if (!target) {
        // Mismatch (e.g. unexpected heading levels or stale toc). Warn once per
        // navigation so a drift is visible in the console without spamming.
        console.warn(
          `[website] toc flatIndex drift: flatIndex=${flatIndex} tocFlat=${tocFlatLength} headings=${headings.length} hasStrippedLeadingH1=${hasStrippedLeadingH1}`,
        );
        return;
      }
      const worldY = target.getWorldTransform().f;
      const documentY = worldY + window.scrollY;
      const headerClearance = 100;
      window.scrollTo({
        top: Math.max(0, documentY - headerClearance),
        behavior: 'smooth',
      });
    };

    page.height = detailY;

    const reflowBelowMd = () => {
      // Stale layout from a previous page's Markdown (e.g. a late MathJax
      // retypeset or image decode after SPA navigation) must not overwrite the
      // new page's body height. Bail when generation is stale.
      if (generation !== renderGeneration) return;
      let nextY = md.y + md.height + 24;
      page.height = nextY;
      if (footerContainer) {
        const footerY = page.height + 60;
        footerContainer.setPosition(0, footerY);
        page.height = footerY + 80;
      }
      if (typeof document !== 'undefined') {
        document.body.style.height = `${page.height + LAYOUT.navHeight + 40}px`;
        mainScroll.height = page.height + 40;
        // Sync the canvas transform to the current scroll without forcing a
        // `window.scrollTo` clamp — the previous synchronous clamp
        // `if(window.scrollY>maxScroll) window.scrollTo(0,maxScroll)` fought
        // the browser's APZ transaction when `reflowBelowMd` fired mid-drag:
        // the scrollbar thumb was at the old `maxScrollY` while the new
        // `maxAfter` was smaller/larger, and the forced `scrollTo` pulled
        // `window.scrollY` away from the thumb, leaving the page visually
        // stuck. The browser naturally clamps `scrollY` on the next frame if
        // it is truly beyond the new max; we only need to keep
        // `mainScroll.y` in sync and re-mark dirty.
        try {
          if (currentMainScroll) currentMainScroll.y = -window.scrollY;
        } catch {}
      }
      currentScene?.markDirty();
    };

    md.onLayoutUpdated = reflowBelowMd;

    // Fallback for Markdown paths that republish height without notifying
    // (e.g. `retypesetFromTokens` after the lazy MathJax load). Poll `md.height`
    // briefly and trigger the same reflow the host would have run. Stored in
    // module-level vars so a navigation clears the previous page's poll instead
    // of stacking multiple 100 ms timers that fight the new page's layout.
    {
      let lastMdHeight = md.height;
      // Already cleared at top of renderApp, but guard against double-clear
      if (mdHeightPollId !== null) {
        clearInterval(mdHeightPollId);
        mdHeightPollId = null;
      }
      if (mdHeightPollTimeoutId !== null) {
        clearTimeout(mdHeightPollTimeoutId);
        mdHeightPollTimeoutId = null;
      }
      mdHeightPollId = setInterval(() => {
        if (generation !== renderGeneration) {
          if (mdHeightPollId !== null) {
            clearInterval(mdHeightPollId);
            mdHeightPollId = null;
          }
          return;
        }
        if (md.height !== lastMdHeight) {
          lastMdHeight = md.height;
          reflowBelowMd();
        }
      }, 100);
      mdHeightPollTimeoutId = setTimeout(() => {
        if (mdHeightPollId !== null) {
          clearInterval(mdHeightPollId);
          mdHeightPollId = null;
        }
        mdHeightPollTimeoutId = null;
      }, 5000);
    }

    if (mobileToc) {
      mobileToc.onToggle = () => {
        md.setPosition(0, mobileToc.y + mobileToc.height + 24);
        reflowBelowMd();
      };
    }

    const footerY = page.height + 60;
    footerContainer = new Container();
    footerContainer.setPosition(0, footerY);
    const footerText = withWholeLineProjection(
      new Text(t('footer.copyright'), {
        font: '14px Inter, sans-serif',
        color: colors.muted,
      }),
    );
    footerText.setPosition(0, 0);
    footerContainer.add(footerText);
    page.add(footerContainer);
    page.height = footerY + 80;

    currentY = page.y + page.height;
  }

  // ── page height sync ────────────────────────────────────────────────────────
  mainScroll.height = currentY - LAYOUT.navHeight;
  if (typeof document !== 'undefined') {
    document.body.style.height = `${currentY}px`;
  }

  currentScene.markDirty();
  currentScene.render(currentScene.getRenderer(), 0, performance.now());
}

/** Old-site footer: recessed surface, copyright line and links. */
async function buildFooter(
  parent: Container,
  copyright: string,
  colors: ReturnType<typeof resolveThemeColors>,
  innerW: number,
  contentX: number,
  topY: number,
): Promise<number> {
  const footer = new Container();
  footer.x = 0;
  footer.y = topY;
  footer.width = window.innerWidth;
  footer.height = 96;

  const bg = new (class extends Container {
    render(r: IRenderer): void {
      fillRect(r, 0, 0, footer.width, footer.height, colors.surface2);
      fillRect(r, 0, 0, footer.width, 1, colors.divider);
    }
  })();
  footer.add(bg);

  const copy = withWholeLineProjection(
    new Text(copyright, {
      font: '14.4px Inter, sans-serif',
      color: colors.muted,
    }),
  );
  copy.x = contentX;
  copy.y = 40;
  footer.add(copy);

  const links: { label: string; href: string }[] = [
    { label: 'GitHub', href: 'https://github.com/vectojs/vectojs' },
    { label: 'VectoJS', href: 'https://vectojs.org' },
  ];
  let lx = contentX + innerW;
  for (const link of links) {
    const el = withWholeLineProjection(
      new Text(link.label, {
        font: '14.4px Inter, sans-serif',
        color: colors.muted,
      }),
    );
    lx -= el.width;
    el.x = lx;
    el.y = 40;
    el.interactive = true;
    el.getA11yAttributes = () => ({ role: 'link', label: el.text });
    el.on('click', () => {
      if (link.href.startsWith('http')) window.open(link.href, '_blank', 'noopener');
      else navigateTo(link.href);
    });
    footer.add(el);
    lx -= 24;
  }

  parent.add(footer);
  return topY;
}

async function renderPage(): Promise<void> {
  if (currentPageData) {
    await renderApp();
  }
}

// ─── Entry Point ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await boot();
  } catch (err) {
    document.title = 'BOOT-ERR: ' + String(err instanceof Error ? err.message : err);
  }
});

async function boot(): Promise<void> {
  const canvas = document.getElementById('vecto-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  registerSearchShortcut();
  currentScene = new Scene(canvas, { maxFPS: 0, renderMode: 'onDemand' });
  currentScene.start();

  // The styles layer must own the active theme before any var(--…) resolves.
  applyWebsiteTheme(websiteThemeName());

  if (typeof location !== 'undefined' && location.search.includes('debug')) {
    const { attachDevtools } = await import('@vectojs/devtools');
    attachDevtools(currentScene, { defaultTab: 'tree', showPerf: true });
  }

  // Initial resize to set up canvas backing store
  currentScene.resize(window.innerWidth, window.innerHeight);

  const dataElement = document.getElementById('page-data');
  if (dataElement) {
    currentPageData = JSON.parse(dataElement.textContent || '');
  }

  // Register the callback so the router can trigger renders without circular import
  setPageDataCallback((data) => {
    currentPageData = data;
    void renderApp();
  });

  // Wait for the webfonts before the first layout: ui Text measures at
  // construction, so a layout built against the fallback font is wrong even
  // after fonts load (Text re-lays out itself, but the container geometry
  // built around the wrong measurement never updates). fonts.ready is NOT
  // enough: with a canvas-only page no DOM text ever uses the fonts, so
  // nothing triggers their download and ready resolves immediately. Load each
  // family/weight explicitly instead. AllSettled: font failures must not
  // block the page (fallback metrics are then used and the site still works).
  const fontSpecs = [
    '400 16px Inter',
    '500 16px Inter',
    '600 16px Inter',
    '700 16px Inter',
    '400 16px Outfit',
    '600 16px Outfit',
    '800 16px Outfit',
    '700 16px "Playfair Display"',
    '800 16px "Playfair Display"',
    '900 16px "Playfair Display"',
  ];
  const fonts = (document as any).fonts;
  if (fonts) {
    await Promise.allSettled(fontSpecs.map((s) => fonts.load(s)));
  }
  // Canvas-only pages don't drive the font loader from DOM text, and a layout
  // built during font loading measures with fallback metrics (ui Text keeps
  // its own lines but the container geometry built from the wrong measurement
  // never updates). Rebuild once when the fonts really finish loading.
  // The single-fire flag is kept but a stale-generation bail (e.g. an
  // in-flight markdown fetch) would otherwise leave the page stuck with
  // fallback metrics — schedule a second attempt to guarantee final geometry.
  let fontRerenderDone = false;
  fonts?.addEventListener?.('loadingdone', () => {
    if (fontRerenderDone) return;
    fontRerenderDone = true;
    void renderPage();
    // If the render above bailed due to a generation race, retry once after
    // the in-flight markdown settles. The second call is cheap when the
    // first succeeded (re-renders same content) but guarantees correction
    // when the first was superseded.
    setTimeout(() => {
      void renderPage();
    }, 450);
  });
  await renderPage();

  let lastWidth = window.innerWidth;
  let resizeAnimationFrameId: number | null = null;

  // Use ResizeObserver for precise container tracking and Firefox Range recalibration.
  // ResizeObserver reports contentRect in CSS px, which matches window.innerWidth at
  // any zoom level (zoom shrinks both). dprChanged catches monitor-move / emulation.
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      const rawDpr = (window as unknown as { devicePixelRatio?: number }).devicePixelRatio;
      const newDpr = Number.isFinite(rawDpr) && (rawDpr as number) > 0 ? (rawDpr as number) : 1;

      // Width-only: layout must rebuild.
      // DPR-only (monitor move, emulation): backing store must rescale.
      // Height-only (mobile URL bar slide): just repaint.
      // Use 0.5 CSS px for width — large enough to ignore sub-pixel jitter from
      // fractional zoom (1.1000000685) but small enough to catch any real zoom
      // (110% shrinks 1280 -> 1163, delta 117). dprChanged (epsilon 0.001) will
      // still catch a DPR-only change even when width jitter is <0.5.
      const widthChanged = Number.isFinite(width) && Math.abs(width - lastWidth) > 0.5;
      const dprChanged = Math.abs(newDpr - lastDpr) > 0.001;

      if (widthChanged || dprChanged) {
        lastWidth = Number.isFinite(width) ? width : lastWidth;
        lastDpr = newDpr;

        // Resize the scene with current logical CSS px. This re-reads DPR, rescales
        // the backing store, and recalibrates Firefox's Range metrics.
        // Guard 0/NaN so a transient 0-height doesn't zero the viewport.
        if (currentScene) {
          try {
            const h = window.innerHeight;
            const safeH = Number.isFinite(h) && h > 0 ? h : height;
            const safeW = Number.isFinite(width) && width > 0 ? width : lastWidth;
            currentScene.resize(safeW, safeH);
            // Synchronous render with correct signature prevents a black frame
            // while the async handleResize() rebuild is pending. Wrap so one
            // failed frame doesn't break the observer.
            try {
              currentScene.render(currentScene.getRenderer(), 0, performance.now());
            } catch (err) {
              console.warn('[website] sync render failed', err);
            }
          } catch (err) {
            console.warn('[website] resize failed', err);
          }
        }

        // Debounce the full layout rebuild into the next rAF
        if (resizeAnimationFrameId === null) {
          resizeAnimationFrameId = requestAnimationFrame(() => {
            resizeAnimationFrameId = null;
            void handleResize().catch((err) => console.warn('[website] handleResize failed', err));
          });
        }
      } else {
        // Height-only change (mobile URL bar): resize backing store but don't rebuild
        // Use window.innerHeight for consistency with the widthChanged branch —
        // contentRect height may lag behind the window or be 0 when hidden.
        try {
          const h = window.innerHeight;
          const safeH = Number.isFinite(h) && h > 0 ? h : height;
          if (Number.isFinite(width) && width > 0 && Number.isFinite(safeH) && safeH > 0) {
            currentScene?.resize(width, safeH);
          }
          currentScene?.markDirty();
        } catch (err) {
          console.warn('[website] height-only resize failed', err);
        }
      }
    }
  });

  resizeObserver.observe(canvas);

  // DPR monitoring. A browser-zoom change also changes the CSS-px viewport, so the
  // ResizeObserver above already catches it; this poll only covers a DPR change with
  // no size change (monitor move, CDP emulation). It must NOT use
  // matchMedia('(resolution: Ndppx)') re-armed on every change: registering a fresh
  // query fires it immediately, and at fractional zoom (110% reports
  // devicePixelRatio 1.1000000685) the value jitters below the query's own
  // resolution, so re-arming re-triggers itself and the page flickers continuously.
  lastDpr =
    Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  setInterval(() => {
    const raw = (window as unknown as { devicePixelRatio?: number }).devicePixelRatio;
    const newDpr = Number.isFinite(raw) && (raw as number) > 0 ? (raw as number) : 1;
    // Same epsilon as the ResizeObserver: ignore sub-0.001 float jitter.
    if (Math.abs(newDpr - lastDpr) <= 0.001) return;
    lastDpr = newDpr;
    // Ensure backing store is rescaled before the rebuild — handleResize's
    // pre-resize will also do it, but do it here as well so a failing rebuild
    // doesn't leave the canvas at the old DPR.
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        currentScene?.resize(w, h);
        try {
          if (currentScene) currentScene.render(currentScene.getRenderer(), 0, performance.now());
        } catch {}
      }
    } catch (err) {
      console.warn('[website] poll resize failed', err);
    }
    void handleResize().catch((err) => console.warn('[website] poll handleResize failed', err));
  }, 1000);

  window.addEventListener('popstate', async () => {
    await handleUrlRoute(window.location.pathname);
  });
}
