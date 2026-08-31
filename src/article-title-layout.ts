export interface ArticleTitleMetrics {
  fontSize: number;
  lineHeight: number;
}

/** Typography dimensions in logical CSS pixels for a wrapped article title. */
export function articleTitleMetrics(isMobile: boolean): ArticleTitleMetrics {
  const fontSize = isMobile ? 32 : 40;
  return {
    fontSize,
    // @vectojs/ui Text defaults to a 20px pitch regardless of font size. A
    // measured 1.3x pitch keeps 32/40px Outfit glyphs in separate ink bands.
    lineHeight: Math.ceil(fontSize * 1.3),
  };
}

/** Height consumed by an article title, with one full line as the minimum. */
export function articleTitleHeight(measuredHeight: number, metrics: ArticleTitleMetrics): number {
  return Math.max(measuredHeight, metrics.lineHeight);
}
