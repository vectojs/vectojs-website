import { Scene } from '@vectojs/core';
import { Text, RichText } from '@vectojs/ui';
import { applyStyle, style } from '@vectojs/styles';
import { createArticleMarkdown } from './article';
import { withWholeLineProjection } from './text-utils';
import { Container, DividerLine, ReadingProgressBar, PageContainer } from './entities';
import {
  applyWebsiteTheme,
  resolveThemeColors,
  resolveLayoutMetrics,
  websiteThemeName,
} from './theme';
import { TocSidebar, MobileToc, type TocEntry } from './toc';
import { navigateTo, handleUrlRoute, setPageDataCallback } from './router';

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

async function renderApp(): Promise<void> {
  if (!currentScene || !currentPageData) return;

  // Clear existing entities
  const root = (currentScene as any).root;
  if (root?.children) {
    const kids = [...root.children];
    for (const kid of kids) {
      currentScene.remove(kid);
      const destroySubtree = (node: any) => {
        if (node.children) {
          const children = [...node.children];
          for (const c of children) destroySubtree(c);
        }
        if (typeof node.destroy === 'function') node.destroy();
      };
      destroySubtree(kid);
    }
  }

  const { width, contentWidth, originX, isMobile } = resolveLayoutMetrics(window.innerWidth);
  const colors = resolveThemeColors();

  const mainScroll = new Container();
  currentMainScroll = mainScroll;

  mainScroll.setTransition({ y: { duration: 120, easing: 'easeOutCubic' } });

  const _origUpdate = mainScroll.update.bind(mainScroll);
  mainScroll.update = function (dt: number, time: number) {
    _origUpdate(dt, time);
    if (this.hasPendingAnimations()) {
      currentScene?.markDirty();
    }
  };

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

  const progressBar = new ReadingProgressBar(mainScroll, width, colors.progressBar);
  currentScene.add(progressBar);

  if (typeof window !== 'undefined') {
    (window as any).currentScene = currentScene;
    (window as any).mainScroll = mainScroll;
  }

  let currentY = 20;

  // ── Header ──────────────────────────────────────────────────────────────────
  const headerContainer = new Container();
  headerContainer.setPosition(originX, currentY);

  const payload = currentPageData as any;

  const titleText = withWholeLineProjection(
    new RichText([{ text: payload.config?.title || 'VectoJS', style: { href: '/' } }], {
      font: '600 24px system-ui, sans-serif',
      onLinkClick: () => navigateTo('/'),
    }),
  );
  applyStyle(titleText, style({ color: 'var(--heading)' }));
  headerContainer.add(titleText);

  mainScroll.add(headerContainer);
  currentY += 80;

  // ── Divider ─────────────────────────────────────────────────────────────────
  const divider = new DividerLine(contentWidth, colors.divider);
  divider.setPosition(originX, currentY);
  mainScroll.add(divider);

  currentY += 40;

  // ── Page content ────────────────────────────────────────────────────────────
  const page = new PageContainer();
  page.setPosition(originX, currentY);
  mainScroll.add(page);
  let footerContainer: Container | null = null;

  if (payload.data?.type === 'page') {
    let detailY = 0;

    const pageTitle = withWholeLineProjection(
      new RichText(
        [
          {
            text: payload.data.title || 'Untitled',
          },
        ],
        {
          font: `bold ${isMobile ? 32 : 44}px system-ui, sans-serif`,
          maxWidth: contentWidth,
        },
      ),
    );
    applyStyle(pageTitle, style({ color: 'var(--heading)' }));
    pageTitle.setPosition(0, detailY);
    page.add(pageTitle);

    detailY += pageTitle.height + 24;

    const toc: TocEntry[] = payload.data.toc || [];
    const showToc = toc.length > 0;
    const tocSidebarWidth = 240;
    const showDesktopToc = showToc && !isMobile && originX >= tocSidebarWidth + 40;
    let mobileToc: MobileToc | null = null;

    const navigateToHeading = { fn: (_flatIndex: number) => {} };
    const onTocNavigate = (flatIndex: number) => navigateToHeading.fn(flatIndex);

    if (showToc && !showDesktopToc) {
      mobileToc = new MobileToc(toc, contentWidth, onTocNavigate);
      mobileToc.setPosition(0, detailY);
      page.add(mobileToc);
      detailY += mobileToc.height + 24;
    }

    // raw_content is the full .md file loaded via Zola's load_data(); frontmatter
    // stripping happens inside createArticleMarkdown (article.ts).
    const md = await createArticleMarkdown(payload.data.raw_content || '', {
      maxWidth: contentWidth,
      theme: {
        bodyFont: 'system-ui, sans-serif',
        codeFont: 'monospace',
        textColor: colors.text,
        headingColor: colors.heading,
        codeColor: colors.codeText,
        codeBgColor: colors.codeBg,
        quoteBorderColor: colors.quoteBorder,
        quoteTextColor: colors.muted,
        hrColor: colors.divider,
        syntaxKeywordColor: colors.syntaxKeyword,
        syntaxStringColor: colors.syntaxString,
        syntaxCommentColor: colors.syntaxComment,
        syntaxNumberColor: colors.syntaxNumber,
        fontSize: isMobile ? 16 : 18,
      },
      blockAffordances: true,
      showCodeLanguage: true,
      onLinkClick: (url: string) => navigateTo(url),
    });
    md.setPosition(0, detailY);
    page.add(md);
    detailY += md.height + 24;

    if (showDesktopToc) {
      const sidebar = new TocSidebar(toc, tocSidebarWidth, onTocNavigate);
      sidebar.setPosition(originX + contentWidth + 40, currentY + md.y);
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
        document.body.style.height = `${page.height}px`;
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
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footerY = page.height + 60;
  footerContainer = new Container();
  footerContainer.setPosition(0, footerY);

  const footerText = withWholeLineProjection(
    new Text(`© ${new Date().getFullYear()} VectoJS. Built with VectoJS.`, {
      font: '14px system-ui, sans-serif',
    }),
  );
  applyStyle(footerText, style({ color: 'var(--muted)' }));
  footerText.setPosition(0, 0);
  footerContainer.add(footerText);

  page.add(footerContainer);
  page.height = footerY + 80;

  if (typeof document !== 'undefined') {
    document.body.style.height = `${page.height}px`;
    mainScroll.height = page.height;
  }

  currentScene.markDirty();
  currentScene.render(currentScene.getRenderer(), 0, performance.now());
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

  if (typeof document !== 'undefined' && (document as any).fonts) {
    (document as any).fonts.ready.then(() => {
      void renderPage();
    });
  }
});
