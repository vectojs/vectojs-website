import { Entity, type IRenderer, type Scene } from '@vectojs/core';
import { Card, DOCUMENT_SCROLL_PHYSICS, ScrollView, Stack, Text } from '@vectojs/ui';
import { LAYOUT, type ThemeColors } from './theme';
import { fillRect } from './entities';
import type { Locale } from './i18n/config';
import { useTranslations } from './i18n/ui';
import { groupReferencePages } from './reference-groups';
import { makeAllUnselectable } from './text-utils';

export interface SidebarEntry {
  title: string;
  path: string;
}

export interface SidebarOptions {
  colors: ThemeColors;
  lang: Locale;
  pages: SidebarEntry[];
  activePath: string;
  viewportWidth: number;
  viewportHeight: number;
  onNavigate: (url: string) => void;
  onToggle: () => void;
}

export const SIDEBAR_WIDTH = 240;
const STORAGE_KEY = 'vecto-sidebar-collapsed';

/** Whether the doc sidebar is currently collapsed (persisted per visitor). */
export function sidebarCollapsed(mobile: boolean): boolean {
  if (typeof localStorage === 'undefined') return mobile;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === '1';
  return mobile;
}

/** Collapse state setter used by the toggle button + resize logic. */
export function setSidebarCollapsed(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // private browsing — collapse applies for this session only
  }
}

/**
 * Which group header paths are currently open, persisted across navigation so
 * expanding a group and clicking into it does not reset the others to closed.
 * Initialised empty; the first render auto-opens the group that contains the
 * active page when the path isn't recorded yet.
 */
const persistedGroupOpen = new Map<string, boolean>();

/** Truncate a title to one line with an ellipsis (sidebar rows are 28px tall). */
function truncateToWidth(text: string, font: string, maxWidth: number): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text;
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

interface RowSpec {
  page: SidebarEntry;
  /** Overrides the displayed title (e.g. "Overview" for the first child link). */
  displayTitle?: string;
  indent: number;
  active: boolean;
  isGroupHeader: boolean;
  groupOpen: boolean;
  onClick: () => void;
}

/**
 * Left-hand docs navigation: the section's page list, fixed under the navbar
 * like the old site's sidebar. Reference pages render as collapsible package
 * groups (the old Astro site's `<details>` sections, auto-opened around the
 * active page); Learn stays a flat list. Collapsible via the header chevron;
 * the whole bar is a scene-root entity so it does not scroll with the article.
 */
export function buildSidebar(parent: Scene, opts: SidebarOptions): Entity {
  const { colors, lang, pages, activePath, viewportHeight, onNavigate, onToggle } = opts;
  const t = useTranslations(lang);
  const width = SIDEBAR_WIDTH;
  const top = LAYOUT.navHeight;
  const height = viewportHeight - top;
  const pad = 20;
  const rowH = 28;
  const isReference = activePath.includes('/reference/');

  const root = new Entity();
  root.isPointInside = () => false;
  // Entity.render is abstract; a bare Entity would abort the render loop.
  root.render = () => {};

  const bg = new Entity();
  bg.isPointInside = () => false;
  bg.width = width;
  bg.height = height;
  bg.render = (r: IRenderer): void => {
    r.beginPath();
    r.roundRect(0, 0, width, height, 0);
    r.fill(colors.bg);
    r.beginPath();
    r.roundRect(width - 1, 0, 1, height, 0);
    r.fill(colors.divider);
  };
  bg.x = 0;
  bg.y = top;
  root.add(bg);

  // Header row: section label + collapse chevron.
  const header = new Stack({ direction: 'horizontal', gap: 12 });
  header.x = pad;
  header.y = top + 20;
  const sectionName = isReference ? t('nav.reference') : t('nav.learn');
  const label = new Text(lang === 'en' ? sectionName.toUpperCase() : sectionName, {
    font: '700 13px Inter, sans-serif',
    color: colors.faint,
  });
  header.add(label);
  root.add(header);

  const chevron = new Text('«', {
    font: '16px Inter, sans-serif',
    color: colors.muted,
  });
  chevron.x = width - pad - chevron.width;
  chevron.y = top + 20;
  chevron.interactive = true;
  chevron.width = 32;
  chevron.height = 24;
  chevron.getA11yAttributes = () => ({
    role: 'button',
    label: t('nav.collapseSidebar'),
  });
  chevron.on('click', onToggle);
  root.add(chevron);

  const isActive = (path: string): boolean =>
    path === activePath || (path.endsWith('/') && activePath.startsWith(path));

  // Group open state: try the persisted map first; fall back to auto-opening
  // the group that contains the active page (Astro parity).
  const groups = isReference ? groupReferencePages(pages) : [];
  const groupOpen = new Map<string, boolean>();
  for (const g of groups) {
    const all = [g.header, ...g.children];
    const autoOpen = all.some((p) => isActive(p.path));
    groupOpen.set(
      g.header.path,
      persistedGroupOpen.has(g.header.path)
        ? (persistedGroupOpen.get(g.header.path) ?? autoOpen)
        : autoOpen,
    );
  }

  /** Recompute the flat row list from the current group open states. */
  const computeRowSpecs = (): RowSpec[] => {
    const specs: RowSpec[] = [];
    if (isReference) {
      for (const g of groups) {
        const open = groupOpen.get(g.header.path) ?? false;
        if (g.children.length === 0) {
          specs.push({
            page: g.header,
            indent: 0,
            active: isActive(g.header.path),
            isGroupHeader: false,
            groupOpen: false,
            onClick: () => onNavigate(g.header.path),
          });
          continue;
        }
        // Group header row: strip the trailing " Reference" label so the row
        // stays compact ("@vectojs/core API" instead of "@vectojs/core API Reference").
        specs.push({
          page: g.header,
          displayTitle: g.header.title.replace(/\s+Reference$/i, ''),
          indent: 0,
          active: isActive(g.header.path),
          isGroupHeader: true,
          groupOpen: open,
          onClick: () => {
            const next = !open;
            groupOpen.set(g.header.path, next);
            persistedGroupOpen.set(g.header.path, next);
            renderRows();
          },
        });
        if (open) {
          for (const [ci, child] of [g.header, ...g.children].entries()) {
            specs.push({
              page: child,
              // First child (the repeated header page) becomes "Overview" to
              // avoid displaying the full package name twice in a row.
              displayTitle: ci === 0 ? 'Overview' : undefined,
              indent: 16,
              active: isActive(child.path),
              isGroupHeader: false,
              groupOpen: false,
              onClick: () => onNavigate(child.path),
            });
          }
        }
      }
    } else {
      for (const page of pages) {
        specs.push({
          page,
          indent: 0,
          active: isActive(page.path),
          isGroupHeader: false,
          groupOpen: false,
          onClick: () => onNavigate(page.path),
        });
      }
    }
    return specs;
  };

  // Page list in a scrollable container.
  const scrollHeight = height - 64; // header 20 + label 24 + gap 20 = 64
  const list = new Stack({ direction: 'vertical', gap: 2 });
  let scrollHost: ScrollView | null = null;

  const makeRow = (spec: RowSpec): Card => {
    const { page, indent, active, groupOpen, onClick } = spec;
    // Prefer the display override (header strips " Reference"; first child is
    // "Overview") — the raw page.title is still used for navigation/identity.
    const title = spec.displayTitle ?? page.title;
    const font = active ? '600 13.5px Inter, sans-serif' : '13.5px Inter, sans-serif';
    // Titles wrap instead of truncating (old-site parity: `.sidebar-link` is a
    // full-width block with no ellipsis), so a long package title takes two
    // lines instead of vanishing into "…".
    const item = new Text(title, {
      font,
      color: active ? colors.accent : colors.text,
      maxWidth: width - pad * 2 - 24 - indent,
    });
    const row = new Card({
      width: width - pad,
      height: Math.max(rowH, item.height),
      bg: active ? 'rgba(99,102,241,0.1)' : 'transparent',
      radius: 6,
    });
    row.x = 10;
    row.y = 0;
    row.add(item);
    item.x = 10 + indent;
    item.y = (row.height - item.height) / 2;
    // The ROW is the interactive unit, not the text: the a11y mirror then
    // spans the full row width instead of the ~40px text box, so clicking
    // anywhere on the row works (old site's block-level link behavior).
    row.interactive = true;
    row.getA11yAttributes = () => ({
      role: 'link',
      label: title,
      tabIndex: -1,
    });
    // Hover feedback matches the old site's `.sidebar-link:hover`.
    row.on('hover', () => {
      if (active) return;
      row.bg = colors.rowHover;
      (row.scene as Scene | undefined)?.markDirty();
    });
    row.on('pointerleave', () => {
      if (active) return;
      row.bg = 'transparent';
      (row.scene as Scene | undefined)?.markDirty();
    });
    row.on('click', () => {
      if (active && !spec.isGroupHeader) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        onClick();
      }
    });
    if (spec.isGroupHeader) {
      const glyph = new Text(groupOpen ? '▾' : '▸', {
        font: '12px Inter, sans-serif',
        color: colors.muted,
      });
      glyph.x = row.width - 26;
      glyph.y = (rowH - glyph.height) / 2;
      glyph.interactive = false;
      row.add(glyph);
    }
    return row;
  };

  /** Rebuild every row from scratch — cheap (~50 Text measures) and keeps
   *  row order/glyph state trivially consistent with group open states. */
  const renderRows = (): void => {
    while (list.children.length > 0) list.remove(list.children[list.children.length - 1]);
    const specs = computeRowSpecs();
    let y = 0;
    for (const spec of specs) {
      const row = makeRow(spec);
      row.y = y;
      list.add(row);
      y += row.height + 2;
    }
    list.height = Math.max(0, y - 2);
    if (scrollHost) {
      scrollHost.updateContentSize();
    } else {
      // Content outgrew the non-scroll path (a group was expanded): nothing to
      // do here — the no-ScrollView branch is only chosen when the fully
      // expanded list fits, and expansion only shrinks the list.
    }
    parent.markDirty();
  };

  // Both sections own their page list through one real ScrollView. Learn titles
  // can wrap to two or three rows (especially in CJK), so a page-count estimate
  // cannot decide whether the measured list overflows. The upstream
  // wheel-passthrough fix (#525, @vectojs/ui 2.16.6) leaves short lists
  // unaffected: when maxScroll is zero, wheel input continues to the page.
  scrollHost = new ScrollView({
    width: width - 8,
    height: scrollHeight,
    scrollPhysics: DOCUMENT_SCROLL_PHYSICS,
  });
  scrollHost.add(list);
  scrollHost.x = 8;
  scrollHost.y = top + 56;
  root.add(scrollHost);

  renderRows();

  // Sidebar text (labels, chevrons, section header) must not join drag-selection
  // over article content. Article text stays selectable via its own projection.
  makeAllUnselectable(root);

  parent.add(root);
  return root;
}

/** Options for the narrow expand-only button shown when sidebar is collapsed. */
export interface SidebarExpandButtonOptions {
  colors: ThemeColors;
  lang: Locale;
  viewportHeight: number;
  onExpand: () => void;
}

/**
 * Narrow fixed panel (32px wide) at the left edge with a single "»" button.
 * Shown when the sidebar is collapsed so the user can bring it back.
 * Returns the root entity so the caller can swap it out on toggle.
 */
export function buildSidebarExpandButton(parent: Scene, opts: SidebarExpandButtonOptions): Entity {
  const { colors, lang, viewportHeight, onExpand } = opts;
  const t = useTranslations(lang);
  const top = LAYOUT.navHeight;

  const root = new Entity();
  root.isPointInside = () => false;
  root.render = () => {};

  const bg = new Entity();
  bg.isPointInside = () => false;
  bg.width = 32;
  bg.height = viewportHeight - top;
  bg.x = 0;
  bg.y = top;
  bg.render = (r: import('@vectojs/core').IRenderer) => {
    r.fill(colors.surface2, 0, 0, bg.width, bg.height);
  };
  root.add(bg);

  const chevron = new Text('»', {
    font: '16px Inter, sans-serif',
    color: colors.muted,
  });
  chevron.x = (32 - chevron.width) / 2;
  chevron.y = top + 20;
  chevron.interactive = true;
  chevron.width = 32;
  chevron.height = 24;
  chevron.getA11yAttributes = () => ({
    role: 'button',
    label: t('nav.expandSidebar'),
    tabIndex: 0,
  });
  chevron.on('click', onExpand);
  root.add(chevron);

  // Expand-button strip text must not join drag-selection.
  makeAllUnselectable(root);

  parent.add(root);
  return root;
}

export interface MobileDocsOptions {
  colors: ThemeColors;
  lang: Locale;
  pages: SidebarEntry[];
  activePath: string;
  onNavigate: (url: string) => void;
}

/**
 * Mobile docs navigation: an overlay panel docked to the left edge listing the
 * section's pages, replacing the fixed desktop sidebar (which has no room on
 * narrow viewports). Returns a function that closes the panel.
 */
export function buildMobileDocsPanel(parent: Scene, opts: MobileDocsOptions): () => void {
  const { colors, lang, pages, activePath, onNavigate } = opts;
  const t = useTranslations(lang);
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const w = Math.min(320, viewportW - 32);
  const sectionName =
    activePath.split('/')[1] === 'reference' ? t('nav.reference') : t('nav.learn');

  const backdrop = new Entity();
  backdrop.isPointInside = () => true;
  backdrop.width = viewportW;
  backdrop.height = viewportH;
  backdrop.render = (r: IRenderer): void => {
    fillRect(r, 0, 0, viewportW, viewportH, 'rgba(0,0,0,0.65)');
  };
  parent.add(backdrop);

  const panel = new Entity();
  panel.isPointInside = () => true;
  panel.width = w;
  panel.height = Math.min(viewportH - 80, pages.length * 34 + 64);
  panel.x = 0;
  panel.y = LAYOUT.navHeight;
  panel.render = (r: IRenderer): void => {
    r.beginPath();
    r.roundRect(0, 0, w, panel.height, 0);
    r.fill(colors.bg);
    r.beginPath();
    r.roundRect(w - 1, 0, 1, panel.height, 0);
    r.fill(colors.divider);
  };
  parent.add(panel);

  const label = new Text(lang === 'en' ? sectionName.toUpperCase() : sectionName, {
    font: '700 13px Inter, sans-serif',
    color: colors.faint,
  });
  label.x = 16;
  label.y = 16;
  panel.add(label);

  let y = 16 + label.height + 12;
  for (const page of pages) {
    const active =
      page.path === activePath || (page.path.endsWith('/') && activePath.startsWith(page.path));
    const item = new Text(truncateToWidth(page.title, '14px Inter, sans-serif', w - 48), {
      font: active ? '600 14px Inter, sans-serif' : '14px Inter, sans-serif',
      color: active ? colors.accent : colors.text,
    });
    item.x = 16;
    item.y = y;
    item.interactive = true;
    item.getA11yAttributes = () => ({ role: 'link', label: item.text });
    item.width = w - 32;
    item.height = 28;
    item.on('click', () => {
      close();
      if (!active) onNavigate(page.path);
    });
    panel.add(item);
    y += 30;
  }
  panel.height = y + 12;

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    parent.remove(backdrop);
    parent.remove(panel);
    document.removeEventListener('pointerdown', onDoc);
  };

  // Sidebar text must not join drag-selection over article text.
  makeAllUnselectable(panel);
  const onDoc = (e: PointerEvent): void => {
    const inside =
      e.clientX >= panel.x &&
      e.clientX <= panel.x + panel.width &&
      e.clientY >= panel.y &&
      e.clientY <= panel.y + panel.height;
    if (!inside) close();
  };
  // Let the opening click finish propagating before listening for outside taps.
  setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
  return close;
}
