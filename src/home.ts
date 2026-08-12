import { Entity, type IRenderer } from '@vectojs/core';
import { Text } from '@vectojs/ui';
import { getHomeStrings } from './i18n/home';
import type { Locale } from './i18n/config';
import { fillRect } from './entities';
import { LAYOUT, type ThemeColors } from './theme';

/** Strip inline HTML (`<code>…</code>`, entities) from the i18n copy strings. */
export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

const BODY_FONT = '15.2px Inter, sans-serif';

/** Rounded card/tile shell: bg-card fill + border. */
export class PanelCard extends Entity {
  public isPointInside(): boolean {
    return false;
  }
  private colors: ThemeColors;
  private radius: number;

  constructor(width: number, height: number, colors: ThemeColors, radius: number) {
    super();
    this.width = width;
    this.height = height;
    this.colors = colors;
    this.radius = radius;
  }

  public render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, this.radius);
    r.fill(this.colors.bgCard);
    r.stroke(this.colors.divider, 1);
  }
}

export interface HomeOptions {
  lang: Locale;
  colors: ThemeColors;
  contentX: number;
  innerW: number;
  isMobile: boolean;
}

/** One paragraph of muted body text, wrapped to the given width. */
function bodyText(text: string, width: number, colors: ThemeColors): Text {
  // ui Text's lineHeight is a PIXEL value (default 20); a ratio like 1.6 is
  // rendered as a 1.6px line pitch, which collapses wrapped lines together.
  return new Text(text, {
    font: BODY_FONT,
    color: colors.muted,
    maxWidth: width,
    lineHeight: 24,
  });
}

/** Pixel line height from a font shorthand + the Text lineHeight option.
 * ui Text's lineHeight is a PIXEL value (default 20). Values below 10 are
 * treated as ratios (defensive: older call sites passed 1.6-style values).
 */
function lineHeightPx(font: string, lineHeight: number): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  const size = m ? parseFloat(m[1]) : 16;
  return lineHeight < 10 ? size * lineHeight : lineHeight;
}

/** True visual height of a Text: lines × line pitch.
 * ui Text reports height = lines × lineHeight (Text.js:446), which
 * under-shoots a large single line (e.g. 40px font with the 20px default
 * lineHeight reports 20px). Use the larger of lineHeight and fontSize×1.5.
 */
function textHeightPx(text: Text): number {
  const lines = Math.max((text.lines ?? []).length, 1);
  const m = /(\d+(?:\.\d+)?)px/.exec(text.font);
  const size = m ? parseFloat(m[1]) : 16;
  return lines * Math.max(lineHeightPx(text.font, text.lineHeight), size * 1.5);
}

function sectionTitle(text: string, colors: ThemeColors): Text {
  return new Text(text, {
    font: '800 40px Outfit, sans-serif',
    color: colors.strong,
  });
}

function sectionSubtitle(text: string, colors: ThemeColors, width: number): Text {
  return new Text(text, {
    font: '16.8px Inter, sans-serif',
    color: colors.muted,
    maxWidth: width,
    lineHeight: 26,
    textAlign: 'center',
  });
}

/** A row of measured card contents, laid out with equal row heights. */
interface RowLayout<T> {
  rows: { items: T[]; height: number }[];
  cols: number;
}

/** Split items into rows and measure each row's height from the item heights. */
function rowLayout<T>(items: T[], cols: number, heightOf: (it: T) => number): RowLayout<T> {
  const rows: RowLayout<T>['rows'] = [];
  for (let i = 0; i < items.length; i += cols) {
    const slice = items.slice(i, i + cols);
    rows.push({ items: slice, height: Math.max(...slice.map(heightOf)) });
  }
  return { rows, cols };
}

/**
 * Build the homepage marketing sections (features / metrics / use cases) with
 * the old site's geometry, appended to `parent` starting at `topY`.
 *
 * Layout is two-pass: content entities are created (and measured) first, then
 * every card is positioned from its row's real measured height, so card text
 * never overlaps the next row.
 *
 * @returns the y coordinate below the last section.
 */
export function buildHomeSections(parent: Entity, opts: HomeOptions, topY: number): number {
  const { lang, colors, contentX, innerW, isMobile } = opts;
  const home = getHomeStrings(lang);
  let y = topY;

  // ── Features ───────────────────────────────────────────────────────────────
  y += LAYOUT.sectionPad;
  const fTitle = sectionTitle(home.features.title, colors);
  fTitle.x = contentX + (innerW - fTitle.width) / 2;
  fTitle.y = y;
  parent.add(fTitle);
  y += fTitle.height + 64;

  const fCols =
    !isMobile && innerW >= LAYOUT.breakpointWide ? 4 : innerW >= LAYOUT.breakpointNarrow ? 2 : 1;
  const fGap = 28;
  const fCardW = (innerW - fGap * (fCols - 1)) / fCols;
  const fPad = 36;

  const fItems = home.features.cards.map((card) => {
    const icon = new Text(card.icon, { font: '25.6px sans-serif' });
    const title = new Text(stripHtml(card.title), {
      font: '600 21.6px Outfit, sans-serif',
      color: colors.strong,
      maxWidth: fCardW - fPad * 2,
    });
    const body = bodyText(stripHtml(card.body), fCardW - fPad * 2, colors);
    const h = fPad * 2 + 52 + 24 + textHeightPx(title) + 12 + textHeightPx(body);
    return { icon, title, body, h };
  });
  const fGrid = rowLayout(fItems, fCols, (it) => it.h);
  fGrid.rows.forEach((row) => {
    row.items.forEach((it, ci) => {
      const cx = contentX + ci * (fCardW + fGap);
      const shell = new PanelCard(fCardW, row.height, colors, LAYOUT.cardRadius);
      shell.x = cx;
      shell.y = y;
      parent.add(shell);

      const badge = new Entity();
      badge.width = 52;
      badge.height = 52;
      badge.x = shell.x + fPad;
      badge.y = shell.y + fPad;
      badge.render = (r: IRenderer): void => {
        r.beginPath();
        r.roundRect(0, 0, 52, 52, 14);
        r.fill('rgba(91,156,255,0.1)');
        r.stroke('rgba(91,156,255,0.2)', 1);
      };
      parent.add(badge);

      it.icon.x = badge.x + (52 - it.icon.width) / 2;
      it.icon.y = badge.y + (52 - it.icon.height) / 2;
      parent.add(it.icon);

      it.title.x = shell.x + fPad;
      it.title.y = shell.y + fPad + 52 + 24;
      parent.add(it.title);

      it.body.x = shell.x + fPad;
      it.body.y = it.title.y + it.title.height + 12;
      parent.add(it.body);
    });
    y += row.height + fGap;
  });
  y -= fGap;

  // ── Metrics ────────────────────────────────────────────────────────────────
  y += LAYOUT.sectionPadCompact;
  const mDivider = new Entity();
  mDivider.width = innerW;
  mDivider.height = 1;
  mDivider.x = contentX;
  mDivider.y = y - LAYOUT.sectionPadCompact;
  mDivider.render = (r: IRenderer): void => {
    fillRect(r, 0, 0, innerW, 1, colors.divider);
  };
  parent.add(mDivider);

  const mTitle = sectionTitle(home.metrics.title, colors);
  mTitle.x = contentX + (innerW - mTitle.width) / 2;
  mTitle.y = y;
  parent.add(mTitle);
  y += mTitle.height + 64;

  const mSub = sectionSubtitle(home.metrics.subtitle, colors, innerW * 0.8);
  mSub.x = contentX + (innerW - innerW * 0.8) / 2;
  mSub.y = y;
  parent.add(mSub);
  y += mSub.height + 48;

  const mCols = !isMobile && innerW >= 900 ? 3 : innerW >= LAYOUT.breakpointNarrow ? 2 : 1;
  const mGap = 20;
  const mCardW = (innerW - mGap * (mCols - 1)) / mCols;
  const mPad = 28;

  const mItems = home.metrics.items.map((item) => {
    const value = new Text(item.value, {
      font: '700 36px Outfit, sans-serif',
      color: colors.primary,
    });
    const label = new Text(stripHtml(item.label), {
      font: '600 16px Outfit, sans-serif',
      color: colors.text,
      maxWidth: mCardW - mPad * 2,
    });
    const detail = new Text(stripHtml(item.detail), {
      font: '12.8px Inter, sans-serif',
      color: colors.muted,
      maxWidth: mCardW - mPad * 2,
      lineHeight: 20,
    });
    const h = mPad * 2 + textHeightPx(value) + 10 + textHeightPx(label) + 6 + textHeightPx(detail);
    return { value, label, detail, h };
  });
  const mGrid = rowLayout(mItems, mCols, (it) => it.h);
  mGrid.rows.forEach((row) => {
    row.items.forEach((it, ci) => {
      const cx = contentX + ci * (mCardW + mGap);
      const shell = new PanelCard(mCardW, row.height, colors, LAYOUT.tileRadius);
      shell.x = cx;
      shell.y = y;
      parent.add(shell);

      it.value.x = shell.x + mPad;
      it.value.y = shell.y + mPad;
      parent.add(it.value);
      it.label.x = shell.x + mPad;
      it.label.y = it.value.y + textHeightPx(it.value) + 10;
      parent.add(it.label);
      it.detail.x = shell.x + mPad;
      it.detail.y = it.label.y + textHeightPx(it.label) + 6;
      parent.add(it.detail);
    });
    y += row.height + mGap;
  });
  y -= mGap;

  const mFootnote = new Text(stripHtml(home.metrics.footnote), {
    font: '13.1px Inter, sans-serif',
    color: colors.muted,
    maxWidth: innerW * 0.9,
    lineHeight: 21,
    textAlign: 'center',
  });
  mFootnote.x = contentX + (innerW - innerW * 0.9) / 2;
  mFootnote.y = y + 32;
  parent.add(mFootnote);
  y += 32 + mFootnote.height;

  // ── Use cases ──────────────────────────────────────────────────────────────
  y += LAYOUT.sectionPadCompact;
  const uDivider = new Entity();
  uDivider.width = innerW;
  uDivider.height = 1;
  uDivider.x = contentX;
  uDivider.y = y - LAYOUT.sectionPadCompact;
  uDivider.render = (r: IRenderer): void => {
    fillRect(r, 0, 0, innerW, 1, colors.divider);
  };
  parent.add(uDivider);

  const uTitle = sectionTitle(home.usecases.title, colors);
  uTitle.x = contentX + (innerW - uTitle.width) / 2;
  uTitle.y = y;
  parent.add(uTitle);
  y += uTitle.height + 64;

  const uSub = sectionSubtitle(home.usecases.subtitle, colors, innerW * 0.7);
  uSub.x = contentX + (innerW - innerW * 0.7) / 2;
  uSub.y = y;
  parent.add(uSub);
  y += uSub.height + 48;

  const uCols =
    !isMobile && innerW >= LAYOUT.breakpointWide ? 4 : innerW >= LAYOUT.breakpointNarrow ? 2 : 1;
  const uGap = 20;
  const uCardW = (innerW - uGap * (uCols - 1)) / uCols;
  const uPadX = 28;
  const uPadY = 24;

  const uItems = home.usecases.tiles.map((tile) => {
    const label = new Text(stripHtml(tile.label), {
      font: '700 11px Inter, sans-serif',
      color: colors.primary,
    });
    const title = new Text(stripHtml(tile.title), {
      font: '600 16px Outfit, sans-serif',
      color: colors.text,
      maxWidth: uCardW - uPadX * 2,
    });
    const body = bodyText(stripHtml(tile.body), uCardW - uPadX * 2, colors);
    const h = uPadY * 2 + textHeightPx(label) + 8 + textHeightPx(title) + 8 + textHeightPx(body);
    return { label, title, body, h };
  });
  const uGrid = rowLayout(uItems, uCols, (it) => it.h);
  uGrid.rows.forEach((row) => {
    row.items.forEach((it, ci) => {
      const cx = contentX + ci * (uCardW + uGap);
      const shell = new PanelCard(uCardW, row.height, colors, LAYOUT.tileRadius);
      shell.x = cx;
      shell.y = y;
      parent.add(shell);

      it.label.x = shell.x + uPadX;
      it.label.y = shell.y + uPadY;
      parent.add(it.label);
      it.title.x = shell.x + uPadX;
      it.title.y = it.label.y + textHeightPx(it.label) + 8;
      parent.add(it.title);
      it.body.x = shell.x + uPadX;
      it.body.y = it.title.y + textHeightPx(it.title) + 8;
      parent.add(it.body);
    });
    y += row.height + uGap;
  });
  y -= uGap;

  return y;
}
