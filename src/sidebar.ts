import { Entity, type IRenderer, type Scene } from '@vectojs/core';
import { Card, DOCUMENT_SCROLL_PHYSICS, ScrollView, Stack, Text } from '@vectojs/ui';
import { LAYOUT, type ThemeColors } from './theme';
import { fillRect } from './entities';
import type { Locale } from './i18n/config';
import { useTranslations } from './i18n/ui';
import { groupReferencePages } from './reference-groups';

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

  // Group open state: the group containing the active page starts open; the
  // rest start closed (Astro parity: `open={slug === header || children…}`).
  const groups = isReference ? groupReferencePages(pages) : [];
  const groupOpen = new Map<string, boolean>();
  for (const g of groups) {
    const all = [g.header, ...g.children];
    groupOpen.set(
      g.header.path,
      all.some((p) => isActive(p.path)),
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
        specs.push({
          page: g.header,
          indent: 0,
          active: isActive(g.header.path),
          isGroupHeader: true,
          groupOpen: open,
          onClick: () => {
            groupOpen.set(g.header.path, !open);
            renderRows();
          },
        });
        if (open) {
          for (const child of [g.header, ...g.children]) {
            specs.push({
              page: child,
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
    const font = active ? '600 13.5px Inter, sans-serif' : '13.5px Inter, sans-serif';
    const labelText = truncateToWidth(page.title, font, width - pad * 2 - 24 - indent);
    const item = new Text(labelText, {
      font,
      color: active ? colors.accent : colors.text,
    });
    const row = new Card({
      width: width - pad,
      height: rowH,
      bg: active ? 'rgba(99,102,241,0.1)' : 'transparent',
      radius: 6,
    });
    row.x = 10;
    row.y = 0;
    row.add(item);
    item.x = 10 + indent;
    item.y = (rowH - item.height) / 2;
    item.interactive = true;
    item.getA11yAttributes = () => ({ role: 'link', label: item.text });
    // Hover feedback matches the old site's `.sidebar-link:hover`.
    item.on('hover', () => {
      if (active) return;
      row.bg = colors.rowHover;
      (row.scene as Scene | undefined)?.markDirty();
    });
    item.on('pointerleave', () => {
      if (active) return;
      row.bg = 'transparent';
      (row.scene as Scene | undefined)?.markDirty();
    });
    item.on('click', () => {
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
      y += rowH + 2;
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

  // Only wrap in a ScrollView when the fully expanded list actually overflows:
  // a ScrollView preventDefaults wheel even when its content fits, which turned
  // the whole sidebar band into a wheel dead zone on short Learn pages (the old
  // DOM site let the wheel pass through to the page there).
  const expandedRows = computeRowSpecs();
  const expandedHeight = expandedRows.length * (rowH + 2);
  const needsScroll = expandedHeight > scrollHeight;
  if (needsScroll) {
    scrollHost = new ScrollView({
      width: width - 8,
      height: scrollHeight,
      scrollPhysics: DOCUMENT_SCROLL_PHYSICS,
    });
    scrollHost.add(list);
    scrollHost.x = 8;
    scrollHost.y = top + 56;
    root.add(scrollHost);
  } else {
    list.setPosition(8, top + 56);
    root.add(list);
  }

  renderRows();

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
