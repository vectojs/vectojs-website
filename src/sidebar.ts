import { Entity, type IRenderer, type Scene } from '@vectojs/core';
import { Card, Stack, Text } from '@vectojs/ui';
import { LAYOUT, type ThemeColors } from './theme';
import type { Locale } from './i18n/config';
import { useTranslations } from './i18n/ui';

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

/**
 * Left-hand docs navigation: the section's page list, fixed under the navbar
 * like the old site's sidebar. Collapsible via the header chevron; the whole
 * bar is a scene-root entity so it does not scroll with the article.
 */
export function buildSidebar(parent: Scene, opts: SidebarOptions): Entity {
  const { colors, lang, pages, activePath, viewportHeight, onNavigate, onToggle } = opts;
  const t = useTranslations(lang);
  const width = SIDEBAR_WIDTH;
  const top = LAYOUT.navHeight;
  const height = viewportHeight - top;
  const pad = 20;

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
  const label = new Text(lang === 'en' ? 'Docs' : t('nav.learn'), {
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

  // Page list.
  const list = new Stack({ direction: 'vertical', gap: 2 });
  list.x = 8;
  list.y = top + 56;
  const maxItems = Math.max(1, Math.floor((height - 64) / 30));
  for (const page of pages.slice(0, maxItems)) {
    const active =
      page.path === activePath || (page.path.endsWith('/') && activePath.startsWith(page.path));
    const font = active ? '600 13.5px Inter, sans-serif' : '13.5px Inter, sans-serif';
    const labelText = truncateToWidth(page.title, font, width - pad * 2 - 24);
    const item = new Text(labelText, {
      font,
      color: active ? colors.accent : colors.text,
    });
    const row = new Card({
      width: width - pad,
      height: 28,
      bg: active ? 'rgba(99,102,241,0.1)' : 'transparent',
      radius: 6,
    });
    row.x = 10;
    row.y = 0;
    row.add(item);
    item.x = 10;
    item.y = (28 - item.height) / 2;
    if (!active) {
      item.interactive = true;
      item.on('click', () => onNavigate(page.path));
    }
    list.add(row);
  }
  root.add(list);

  parent.add(root);
  return root;
}
