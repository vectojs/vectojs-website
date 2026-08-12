import { Scene, type IRenderer } from '@vectojs/core';
import { Card, Stack, Text } from '@vectojs/ui';
import { createArticleMarkdown } from './article';
import { withWholeLineProjection } from './text-utils';
import { Container, DividerLine, fillRect, PageContainer } from './entities';
import {
  applyWebsiteTheme,
  resolveThemeColors,
  resolveLayoutMetrics,
  websiteThemeName,
  LAYOUT,
} from './theme';
import { createNavbar, type ActiveSection } from './nav';
import { buildHeroSection } from './hero';
import { buildHomeSections } from './home';
import { TocSidebar, MobileToc, type TocEntry } from './toc';
import { buildSidebar, SIDEBAR_WIDTH, sidebarCollapsed, setSidebarCollapsed } from './sidebar';
import { navigateTo, handleUrlRoute, setPageDataCallback } from './router';
import { parseLocale, type Locale } from './i18n/config';
import { useTranslations } from './i18n/ui';
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

  // Always do a full rebuild (matches xuepoo-blog pattern)
  await renderApp();

  // Restore scroll position proportionally after rebuild
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    requestAnimationFrame(() => {
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

  // Every rebuild must resync the styles-layer theme with data-theme: rebuilds
  // triggered by popstate (language switch) or resize would otherwise keep the
  // previous theme's resolved colors (navbar/links/cards built with stale hues).
  applyWebsiteTheme(websiteThemeName());

  if (heroStop) {
    heroStop();
    heroStop = null;
  }
  clearScene(currentScene);

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
      translations?: { title: string; permalink: string }[];
      navigation?: {
        earlier?: { title: string; path: string } | null;
        later?: { title: string; path: string } | null;
      };
    };
  };
  const { locale } = parseLocale(window.location.pathname);
  const lang: Locale = locale;
  const t = useTranslations(lang);
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
    window.addEventListener('scroll', () => {
      if (currentMainScroll) {
        currentMainScroll.y = -window.scrollY;
        currentScene?.markDirty();
      }
    });
  }

  // ── fixed navbar (scene root, drawn above the scrolling content) ────────────
  createNavbar(currentScene, {
    colors,
    lang,
    active,
    viewportWidth: viewportW,
    isMobile,
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
    const collapsed = sidebarCollapsed(isMobile);
    let contentOffset = 0;
    if (sidebarPages.length > 0 && !collapsed) {
      buildSidebar(currentScene, {
        colors,
        lang,
        pages: sidebarPages,
        activePath: payload.data?.path ?? '',
        viewportWidth: viewportW,
        viewportHeight: viewportH,
        onNavigate: (url: string) => navigateTo(url),
        onToggle: () => {
          setSidebarCollapsed(!sidebarCollapsed(isMobile));
          void renderApp();
        },
      });
      contentOffset = SIDEBAR_WIDTH + 32;
    }
    const page = new PageContainer();
    page.setPosition(originX + contentOffset, currentY + 40);
    mainScroll.add(page);
    let detailY = 0;
    let footerContainer: Container | null = null;

    const pageTitle = withWholeLineProjection(
      new Text(payload.data?.title || 'Untitled', {
        font: `800 ${isMobile ? 32 : 40}px Outfit, sans-serif`,
        color: colors.strong,
        maxWidth: contentWidth,
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

    const toc: TocEntry[] = payload.data?.toc ?? [];
    const showToc = toc.length > 0;
    const tocSidebarWidth = 240;
    // The TOC clears the article column's right edge; with a docs sidebar the
    // article already starts at contentOffset, so the TOC needs viewport room
    // for sidebar + article + TOC + margins. On narrower screens it falls back
    // to the mobile TOC.
    const tocX = originX + contentOffset + contentWidth + 40;
    const showDesktopToc = showToc && !isMobile && tocX + tocSidebarWidth <= viewportW;
    let mobileToc: MobileToc | null = null;

    const navigateToHeading = { fn: (_flatIndex: number) => {} };
    const onTocNavigate = (flatIndex: number) => navigateToHeading.fn(flatIndex);

    if (showToc && !showDesktopToc) {
      mobileToc = new MobileToc(toc, contentWidth, onTocNavigate, lang);
      mobileToc.setPosition(0, detailY);
      page.add(mobileToc);
      detailY += mobileToc.height + 24;
    }

    // The page title is rendered above; drop the document's own leading H1
    // (every article starts with `# <title>`) so it doesn't render twice.
    const raw = stripLeadingH1(payload.data?.raw_content ?? '');
    const md = await createArticleMarkdown(raw, {
      maxWidth: contentWidth,
      theme: {
        bodyFont: 'Inter, sans-serif',
        codeFont: 'monospace',
        textColor: colors.text,
        headingColor: colors.heading,
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
      onLinkClick: (url: string) => navigateTo(url),
    });
    // A newer renderApp (fonts.ready, resize, popstate) may have rebuilt the
    // tree while the markdown worker was parsing — attaching this late entity
    // would duplicate it into the fresh tree.
    if (generation !== renderGeneration) return;
    md.setPosition(0, detailY);
    page.add(md);
    detailY += md.height + 24;

    if (showDesktopToc) {
      const sidebar = new TocSidebar(toc, tocSidebarWidth, onTocNavigate, lang);
      // The article column already sits right of the docs sidebar when one is
      // shown; the TOC must clear the article's right edge, not the page's.
      sidebar.setPosition(originX + contentOffset + contentWidth + 40, currentY + md.y);
      currentScene.add(sidebar);
    }

    navigateToHeading.fn = (flatIndex: number) => {
      const heading = md.headingEntities[flatIndex];
      if (!heading || typeof window === 'undefined') return;
      const worldY = heading.getWorldTransform().f;
      const documentY = worldY + window.scrollY;
      const headerClearance = 100;
      window.scrollTo({
        top: Math.max(0, documentY - headerClearance),
        behavior: 'smooth',
      });
    };

    page.height = detailY;

    const reflowBelowMd = () => {
      let nextY = md.y + md.height + 24;
      page.height = nextY;
      if (footerContainer) {
        const footerY = page.height + 60;
        footerContainer.setPosition(0, footerY);
        page.height = footerY + 80;
      }
      if (typeof document !== 'undefined') {
        document.body.style.height = `${page.height + LAYOUT.navHeight}px`;
        mainScroll.height = page.height;
      }
      currentScene?.markDirty();
    };

    md.onLayoutUpdated = reflowBelowMd;

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

    currentY = page.height;
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
  const canvas = document.getElementById('vecto-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  let touchStartY = 0;
  canvas.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches?.[0]) {
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true },
  );

  canvas.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches?.[0]) {
        const touchY = e.touches[0].clientY;
        const deltaY = touchStartY - touchY;
        touchStartY = touchY;
        window.scrollBy(0, deltaY);
      }
    },
    { passive: true },
  );

  currentScene = new Scene(canvas, { maxFPS: 60 });
  currentScene.renderMode = 'onDemand';
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
  let fontRerenderDone = false;
  fonts?.addEventListener?.('loadingdone', () => {
    if (fontRerenderDone) return;
    fontRerenderDone = true;
    void renderPage();
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
      const newDpr = window.devicePixelRatio;

      // Width-only: layout must rebuild.
      // DPR-only (monitor move, emulation): backing store must rescale.
      // Height-only (mobile URL bar slide): just repaint.
      const widthChanged = Math.abs(width - lastWidth) > 0.5;
      const dprChanged = Math.abs(newDpr - lastDpr) > 0.001;

      if (widthChanged || dprChanged) {
        lastWidth = width;
        lastDpr = newDpr;

        // Resize the scene with current logical CSS px. This re-reads DPR, rescales
        // the backing store, and recalibrates Firefox's Range metrics.
        if (currentScene) {
          currentScene.resize(width, window.innerHeight);
          // Synchronous render with correct signature prevents a black frame
          // while the async handleResize() rebuild is pending.
          currentScene.render(currentScene.getRenderer(), 0, performance.now());
        }

        // Debounce the full layout rebuild into the next rAF
        if (resizeAnimationFrameId === null) {
          resizeAnimationFrameId = requestAnimationFrame(() => {
            resizeAnimationFrameId = null;
            void handleResize();
          });
        }
      } else {
        // Height-only change (mobile URL bar): resize backing store but don't rebuild
        currentScene?.resize(width, height);
        currentScene?.markDirty();
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
  lastDpr = window.devicePixelRatio;
  setInterval(() => {
    const newDpr = window.devicePixelRatio;
    // Same epsilon as the ResizeObserver: ignore sub-0.001 float jitter.
    if (Math.abs(newDpr - lastDpr) <= 0.001) return;
    lastDpr = newDpr;
    void handleResize();
  }, 1000);

  window.addEventListener('popstate', async () => {
    await handleUrlRoute(window.location.pathname);
  });
});
