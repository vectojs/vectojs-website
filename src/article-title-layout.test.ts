import { describe, expect, test } from 'bun:test';
import { articleTitleHeight, articleTitleMetrics } from './article-title-layout';

describe('article title layout', () => {
  for (const isMobile of [false, true]) {
    const viewport = isMobile ? 'mobile' : 'desktop';

    test(`${viewport} wrapped lines have non-overlapping ink bands`, () => {
      const metrics = articleTitleMetrics(isMobile);

      expect(metrics.lineHeight).toBeGreaterThan(metrics.fontSize);
      expect(articleTitleHeight(2, metrics)).toBe(metrics.lineHeight * 2);
      expect(articleTitleHeight(2, metrics)).toBeGreaterThan(metrics.fontSize * 2);
    });
  }
});
