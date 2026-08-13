import { Entity, type IRenderer, type A11yAttributes, VectoJSEvent } from '@vectojs/core';
import { Text, RichText, Card } from '@vectojs/ui';
import { Container } from './entities';
import { withWholeLineProjection, makeAllUnselectable } from './text-utils';
import { useTranslations } from './i18n/ui';
import type { Locale } from './i18n/config';
import type { ThemeColors } from './theme';

export interface TocEntry {
  title: string;
  permalink: string;
  children?: TocEntry[];
}

// ─── Link row ─────────────────────────────────────────────────────────────────

class TocLinkRow extends Entity {
  public isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    return local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height;
  }
  constructor(
    private readonly title: string,
    width: number,
    color: string,
    private readonly onActivate: () => void,
  ) {
    super();
    this.interactive = true;
    const label = withWholeLineProjection(
      new RichText([{ text: title, style: { color } }], {
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
  color: string,
  onActivate: () => void,
): TocLinkRow {
  const row = new TocLinkRow(entry.title, width - indent, color, onActivate);
  row.setPosition(indent, 0);
  return row;
}

/**
 * Materialise a flat list of TOC entries into `container`, returning the total
 * height used. H1 entries sit at the left edge; H2 entries are indented 16px.
 */
export function layoutTocRows(
  container: Entity,
  toc: TocEntry[],
  width: number,
  color: string,
  onNavigate: (flatIndex: number) => void,
): number {
  let y = 0;
  let flatIndex = 0;
  for (const h1 of toc) {
    const index = flatIndex++;
    const row = buildTocRow(h1, 0, width, color, () => onNavigate(index));
    row.setPosition(0, y);
    container.add(row);
    y += row.height + 8;
    for (const h2 of h1.children ?? []) {
      const childIndex = flatIndex++;
      const child = buildTocRow(h2, 16, width, color, () => onNavigate(childIndex));
      child.setPosition(16, y);
      container.add(child);
      y += child.height + 8;
    }
  }
  return Math.max(0, y - 8);
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

/** Vertical "On this page" panel rendered to the right of the article column. */
export class TocSidebar extends Entity {
  private collapsed = false;
  private collapseButton: Entity | null = null;
  private contentRoot: Entity;
  private readonly fullWidth: number;

  public isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    return local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height;
  }

  constructor(
    private readonly toc: TocEntry[],
    width: number,
    private readonly onNavigate: (flatIndex: number) => void,
    private readonly lang: Locale,
    private readonly colors: ThemeColors,
    private readonly onToggle?: () => void,
  ) {
    super();
    this.fullWidth = width;
    this.width = width;

    this.contentRoot = new Entity();
    this.contentRoot.isPointInside = () => false;
    this.contentRoot.render = () => {};
    this.add(this.contentRoot);

    this.renderContent();
  }

  public setCollapsed(collapsed: boolean): void {
    if (this.collapsed === collapsed) return;
    this.collapsed = collapsed;
    this.renderContent();
    this.onToggle?.();
  }

  private renderContent(): void {
    for (let i = this.contentRoot.children.length - 1; i >= 0; i--) {
      this.contentRoot.remove(this.contentRoot.children[i]);
    }

    if (this.collapsed) {
      // Narrow expand strip (» chevron). The chevron is placed at the RIGHT
      // edge of the 32px strip — mirroring the left sidebar whose « is at
      // its left edge — so on-screen the button hugs the panel edge.
      this.width = 32;
      const chevron = new Text('»', {
        font: '16px Inter, sans-serif',
        color: this.colors.muted,
      });
      // Right-align within the 32px strip: position the TEXT entity so its
      // left edge lands near the right edge, giving a ~4px inset.
      chevron.x = 32 - chevron.width - 4;
      chevron.y = 4;
      chevron.interactive = true;
      chevron.width = 24;
      chevron.height = 24;
      chevron.getA11yAttributes = () => ({
        role: 'button',
        label: useTranslations(this.lang)('toc.expandToc'),
        tabIndex: 0,
      });
      chevron.on('click', () => this.setCollapsed(false));
      this.contentRoot.add(chevron);
      this.height = 32;
    } else {
      // Full TOC with collapse button pinned at the left edge.
      this.width = this.fullWidth;

      const header = new Entity();
      header.isPointInside = () => false;
      header.render = () => {};
      this.contentRoot.add(header);

      // Collapse button (« chevron) pinned left; title sits to its right.
      // Same left-edge position as the collapsed strip so the control does
      // not jump when the panel toggles.
      const collapseBtn = new Text('«', {
        font: '14px Inter, sans-serif',
        color: this.colors.muted,
      });
      collapseBtn.x = 8;
      collapseBtn.y = 0;
      collapseBtn.interactive = true;
      collapseBtn.width = 20;
      collapseBtn.height = 20;
      collapseBtn.getA11yAttributes = () => ({
        role: 'button',
        label: useTranslations(this.lang)('toc.collapseToc'),
        tabIndex: 0,
      });
      collapseBtn.on('click', () => this.setCollapsed(true));
      header.add(collapseBtn);

      const title = withWholeLineProjection(
        new Text(useTranslations(this.lang)('toc.onThisPage'), {
          font: '600 14px system-ui, sans-serif',
          color: this.colors.text,
        }),
      );
      title.x = 32;
      header.add(title);

      const list = new Container();
      list.setPosition(0, title.height + 12);
      this.contentRoot.add(list);

      this.height =
        title.height +
        12 +
        layoutTocRows(list, this.toc, this.fullWidth, this.colors.muted, this.onNavigate);
    }

    this.clipChildren = true;
    // TOC text must not join drag-selection — only article text is copyable.
    makeAllUnselectable(this.contentRoot);
  }

  public render(_r: IRenderer): void {}
}

// ─── Mobile collapsible ───────────────────────────────────────────────────────

/**
 * Pill-style "▸ Table of Contents" button that expands inline on click.
 *
 * Fires `onToggle` after every expand/collapse so the caller can reflow
 * whatever sits below this widget. The collapsed height is a fixed 40px so
 * the caller can reserve space before the list is populated.
 */
export class MobileToc extends Entity {
  // Must accept hits: the header Card's onClick depends on the subtree being
  // reachable — a false here makes the whole pill click-through (can't expand).
  public isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    if (!local) return false;
    return local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height;
  }
  private expanded = false;
  private header: Card;
  private headerLabel: RichText;
  private list: Container | null = null;
  private readonly collapsedHeight = 40;
  private tocLabel = '';
  private readonly toc: TocEntry[];
  private readonly onNavigate: (flatIndex: number) => void;
  private readonly colors: ThemeColors;
  /** Called after every expand/collapse so the parent can reflow. */
  public onToggle?: () => void;

  constructor(
    toc: TocEntry[],
    width: number,
    onNavigate: (flatIndex: number) => void,
    lang: Locale,
    colors: ThemeColors,
  ) {
    super();
    this.width = width;
    this.toc = toc;
    this.onNavigate = onNavigate;
    this.colors = colors;
    const t = useTranslations(lang);
    this.header = new Card({
      width,
      height: this.collapsedHeight,
      bg: colors.bgCard,
      border: colors.divider,
      radius: 6,
      label: t('toc.tableOfContents'),
      onClick: () => this.toggle(),
    });
    this.tocLabel = t('toc.tableOfContents');
    this.headerLabel = withWholeLineProjection(
      new RichText([{ text: `▸ ${this.tocLabel}` }], {
        font: 'bold 14px system-ui, sans-serif',
        color: colors.text,
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
        text: this.expanded ? `▾ ${this.tocLabel}` : `▸ ${this.tocLabel}`,
      },
    ]);

    if (this.expanded) {
      this.list = new Container();
      this.list.setPosition(12, this.collapsedHeight + 12);
      this.add(this.list);
      const listHeight = layoutTocRows(
        this.list,
        this.toc,
        this.width - 24,
        this.colors.muted,
        this.onNavigate,
      );
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
