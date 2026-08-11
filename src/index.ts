import { Scene, Entity, type IRenderer, type A11yAttributes, VectoJSEvent } from '@vectojs/core';
import { Text, RichText, Card } from '@vectojs/ui';
import { createArticleMarkdown } from './article';
import { withWholeLineProjection } from './text-utils';

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

// Global state
let currentScene: Scene | null = null;
let currentPageData: any = null;
let scrollListenersAttached = false;
let currentMainScroll: Container | null = null;
let lastDpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
let dprQuery: MediaQueryList | null = null;

class Container extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  public render(_r: any): void {}
}

class DividerLine extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  private color: string;
  constructor(width: number, color: string = '#e5e7eb') {
    super();
    this.width = width;
    this.height = 1;
    this.color = color;
  }
  public render(r: any): void {
    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(this.width, 0);
    r.stroke(this.color, 1);
  }
}

// ─── Table of Contents ─────────────────────────────────────────────────────────

interface TocEntry {
  title: string;
  permalink: string;
  children?: TocEntry[];
}

class TocLinkRow extends Entity {
  public isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    return local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height;
  }
  constructor(
    private readonly title: string,
    width: number,
    private readonly onActivate: () => void,
  ) {
    super();
    this.interactive = true;
    const label = withWholeLineProjection(
      new RichText([{ text: title, style: { color: '#6b7280' } }], {
        font: '14px system-ui, sans-serif',
        maxWidth: width,
      }),
    );
    this.add(label);
    this.width = width;
    this.height = label.height;
    this.on('click', () => this.onActivate());
    this.on('keydown', (e: VectoJSEvent<KeyboardEvent>) => {
      if (e.nativeEvent?.key === 'Enter' || e.nativeEvent?.key === ' ') this.onActivate();
    });
  }
  public override getA11yAttributes(): A11yAttributes {
    return { role: 'link', label: this.title, tabIndex: 0 };
  }
  public render(_r: IRenderer): void {}
}

function buildTocRow(
  entry: TocEntry,
  indent: number,
  width: number,
  onActivate: () => void,
): TocLinkRow {
  const row = new TocLinkRow(entry.title, width - indent, onActivate);
  row.setPosition(indent, 0);
  return row;
}

function layoutTocRows(
  container: Entity,
  toc: TocEntry[],
  width: number,
  onNavigate: (flatIndex: number) => void,
): number {
  let y = 0;
  let flatIndex = 0;
  for (const h1 of toc) {
    const index = flatIndex++;
    const row = buildTocRow(h1, 0, width, () => onNavigate(index));
    row.setPosition(0, y);
    container.add(row);
    y += row.height + 8;
    for (const h2 of h1.children ?? []) {
      const childIndex = flatIndex++;
      const child = buildTocRow(h2, 16, width, () => onNavigate(childIndex));
      child.setPosition(16, y);
      container.add(child);
      y += child.height + 8;
    }
  }
  return Math.max(0, y - 8);
}

class TocSidebar extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  constructor(toc: TocEntry[], width: number, onNavigate: (flatIndex: number) => void) {
    super();
    this.width = width;

    const title = withWholeLineProjection(
      new Text('On this page', {
        font: '600 14px system-ui, sans-serif',
        color: '#111827',
      }),
    );
    this.add(title);

    const list = new Container();
    list.setPosition(0, title.height + 12);
    this.add(list);

    this.height = title.height + 12 + layoutTocRows(list, toc, width, onNavigate);
    this.clipChildren = true;
  }
  public render(_r: IRenderer): void {}
}

class MobileToc extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  private expanded = false;
  private header: Card;
  private headerLabel: RichText;
  private list: Container | null = null;
  private readonly collapsedHeight = 40;
  private readonly toc: TocEntry[];
  private readonly onNavigate: (flatIndex: number) => void;
  public onToggle?: () => void;

  constructor(toc: TocEntry[], width: number, onNavigate: (flatIndex: number) => void) {
    super();
    this.width = width;
    this.toc = toc;
    this.onNavigate = onNavigate;

    this.header = new Card({
      width,
      height: this.collapsedHeight,
      bg: '#f9fafb',
      border: '#e5e7eb',
      radius: 6,
      label: 'Table of Contents',
      onClick: () => this.toggle(),
    });
    this.headerLabel = withWholeLineProjection(
      new RichText([{ text: '▸ Table of Contents' }], {
        font: 'bold 14px system-ui, sans-serif',
        color: '#111827',
      }),
    );
    this.headerLabel.setPosition(12, 11);
    this.header.add(this.headerLabel);
    this.add(this.header);

    this.height = this.collapsedHeight;
  }

  private toggle(): void {
    this.expanded = !this.expanded;
    this.headerLabel.setSpans([
      {
        text: this.expanded ? '▾ Table of Contents' : '▸ Table of Contents',
      },
    ]);

    if (this.expanded) {
      this.list = new Container();
      this.list.setPosition(12, this.collapsedHeight + 12);
      this.add(this.list);
      const listHeight = layoutTocRows(this.list, this.toc, this.width - 24, this.onNavigate);
      this.header.height = this.collapsedHeight + 12 + listHeight + 16;
      this.height = this.header.height;
    } else if (this.list) {
      this.remove(this.list);
      this.list = null;
      this.header.height = this.collapsedHeight;
      this.height = this.collapsedHeight;
    }

    this.onToggle?.();
    this.scene?.markDirty();
  }

  public render(_r: IRenderer): void {}
}

// ─── Reading Progress Bar ──────────────────────────────────────────────────────

class ReadingProgressBar extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  private scrollRef: Container;
  private displayProgress = 0;
  private barColor: string;

  constructor(scrollRef: Container, width: number, barColor: string = '#6366f1') {
    super();
    this.scrollRef = scrollRef;
    this.width = width;
    this.height = 3;
    this.barColor = barColor;
  }

  public override update(dt: number, time: number): void {
    super.update(dt, time);
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const maxScroll = Math.max(1, this.scrollRef.height - window.innerHeight);
    const target = Math.min(1, Math.max(0, scrollY / maxScroll));

    const diff = target - this.displayProgress;
    if (Math.abs(diff) > 0.001) {
      this.displayProgress += diff * (1 - Math.exp(-18 * (dt / 1000)));
      this.scene?.markDirty();
    } else {
      this.displayProgress = target;
    }
  }

  public render(r: any): void {
    if (this.displayProgress <= 0) return;
    r.save();
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(`${this.barColor}1a`); // 10% opacity background

    r.beginPath();
    r.roundRect(0, 0, this.width * this.displayProgress, this.height, 0);
    r.fill(this.barColor);
    r.restore();
  }
}

// ─── Page Container with Fade-in ───────────────────────────────────────────────

class PageContainer extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  constructor() {
    super();
    this.opacity = 0;
    this.setTransition({
      opacity: { duration: 340, easing: 'easeOutCubic' },
    });
    Promise.resolve().then(() => {
      this.opacity = 1;
      this.scene?.markDirty();
    });
  }

  public render(_r: any): void {}
}

// ─── Router & Navigation ───────────────────────────────────────────────────────

function isSameOrigin(parsedUrl: URL): boolean {
  const host = parsedUrl.hostname;
  const currentHost = window.location.hostname;
  if (host === currentHost) return true;
  const domains = ['vectojs.org', 'localhost', '127.0.0.1'];
  const isTarget = domains.includes(host) || host.endsWith('vectojs.pages.dev');
  const isCurrent = domains.includes(currentHost) || currentHost.endsWith('vectojs.pages.dev');
  return isTarget && isCurrent;
}

async function navigateTo(url: string) {
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

async function handleUrlRoute(url: string) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const dataElement = doc.getElementById('page-data');
    if (dataElement) {
      const raw = dataElement.textContent || '';
      currentPageData = JSON.parse(raw);
      if (currentPageData && currentScene) {
        renderApp();
      }
    }
  } catch (e) {
    console.error('SPA Navigation failed, reloading page...', e);
    window.location.href = url;
  }
}

// ─── Responsive Layout Handling ───────────────────────────────────────────────

/** React to a devicePixelRatio change (browser zoom, monitor move, emulation). */
function handleDprChange() {
  lastDpr = window.devicePixelRatio;
  armDprWatch();
  // The ResizeObserver will detect the DPR change via its own dprChanged check
  // and trigger the full rebuild with the correct new window.innerWidth.
  // Calling scene.resize() here with the OLD scene.width would prevent text reflow.
}

/** Arm a media query for the CURRENT DPR; re-arm after every change. */
function armDprWatch(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  if (dprQuery) {
    dprQuery.removeEventListener?.('change', handleDprChange);
  }
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  dprQuery.addEventListener?.('change', handleDprChange);
}

async function handleResize() {
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

async function renderApp() {
  if (!currentScene || !currentPageData) return;

  // Clear existing entities
  const root = (currentScene as any).root;
  if (root && root.children) {
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

  const width = window.innerWidth;
  const contentWidth = Math.min(1024, width - 40);
  const isMobile = contentWidth < 768;
  const originX = (width - contentWidth) / 2;

  // Theme-aware colors — respect the inline theme script in base.html
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const colors = {
    bg: isDark ? '#0b0f19' : '#f8fafc',
    text: isDark ? '#e2e8f0' : '#111827',
    heading: isDark ? '#f1f5f9' : '#111827',
    muted: isDark ? '#64748b' : '#6b7280',
    divider: isDark ? '#1e293b' : '#e5e7eb',
    codeBg: isDark ? '#1e293b' : '#f9fafb',
    codeText: isDark ? '#7c85ff' : '#4f46e5',
    quoteBorder: isDark ? '#6366f1' : '#4f46e5',
    syntaxKeyword: isDark ? '#f87171' : '#dc2626',
    syntaxString: isDark ? '#34d399' : '#059669',
    syntaxComment: isDark ? '#64748b' : '#9ca3af',
    syntaxNumber: isDark ? '#fbbf24' : '#d97706',
    progressBar: isDark ? '#6366f1' : '#4f46e5',
  };

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

  const titleText = withWholeLineProjection(
    new RichText([{ text: currentPageData.config.title || 'VectoJS', style: { href: '/' } }], {
      font: '600 24px system-ui, sans-serif',
      color: colors.heading,
      onLinkClick: () => navigateTo('/'),
    }),
  );
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

  const payload = currentPageData.data;

  if (payload.type === 'page') {
    let detailY = 0;

    const pageTitle = withWholeLineProjection(
      new RichText(
        [
          {
            text: payload.title || 'Untitled',
          },
        ],
        {
          font: `bold ${isMobile ? 32 : 44}px system-ui, sans-serif`,
          color: colors.heading,
          maxWidth: contentWidth,
        },
      ),
    );
    pageTitle.setPosition(0, detailY);
    page.add(pageTitle);

    detailY += pageTitle.height + 24;

    const toc: TocEntry[] = payload.toc || [];
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
    const md = await createArticleMarkdown(payload.raw_content || '', {
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
      color: colors.muted,
    }),
  );
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

// ─── Entry Point ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('vecto-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  let touchStartY = 0;
  canvas.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true },
  );

  canvas.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
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

  // Initial resize to set up canvas backing store
  currentScene.resize(window.innerWidth, window.innerHeight);

  const dataElement = document.getElementById('page-data');
  if (dataElement) {
    currentPageData = JSON.parse(dataElement.textContent || '');
  }

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

  // Initialize DPR monitoring (browser zoom, monitor move, CDP emulation)
  lastDpr = window.devicePixelRatio;
  armDprWatch();

  // Fallback polling for CDP emulation (doesn't fire media query events)
  setInterval(() => {
    if (window.devicePixelRatio !== lastDpr) {
      handleDprChange();
    }
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

async function renderPage() {
  if (currentPageData) {
    await renderApp();
  }
}
