import type { ContentProjection, ContentProjectionHint, Entity } from '@vectojs/core';

/**
 * VectoJS projects natural-order (non-bidi, non-justified) text lines as
 * per-grapheme `inline-block` carriers so DOM selection geometry tracks the
 * canvas's fractional glyph positions (Gecko grid-fits DOM advances to integer
 * device pixels). Side effect: every grapheme becomes its own DOM text node,
 * which splits the browser accessibility tree into per-character `StaticText`
 * nodes — screen readers and braille displays then read text letter by letter
 * (verified on the live site in Chrome and Firefox AX trees).
 *
 * Wrapping `getContentProjection` and clearing `perGraphemeCarriers` on every
 * line makes the projection emit one whole-line text node per visual line (the
 * same shape the styled-run / RichText path already uses). Cost: selection
 * rectangles can drift 1-2px across a long line in Firefox only.
 *
 * Applied to every text entity this app creates, including the ones
 * `@vectojs/markdown` builds (via `TrackedMarkdown.renderToken`).
 */
export function withWholeLineProjection<T extends Entity>(entity: T): T {
  const original = entity.getContentProjection.bind(entity);
  (
    entity as unknown as {
      getContentProjection: (hint?: ContentProjectionHint) => ContentProjection | null;
    }
  ).getContentProjection = (hint?: ContentProjectionHint) => {
    const projection = original(hint);
    if (projection?.lines) {
      for (const line of projection.lines) line.perGraphemeCarriers = false;
    }
    return projection;
  };
  return entity;
}
