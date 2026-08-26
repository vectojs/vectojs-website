import { describe, expect, test } from 'bun:test';
import { fitHeroTitleSize } from './hero';
import { HOME_STRINGS } from './i18n/home';

describe('localized hero titles', () => {
  test('fits every locale within desktop and mobile canvas widths', () => {
    for (const strings of Object.values(HOME_STRINGS)) {
      for (const [width, mobile] of [
        [1440, false],
        [390, true],
      ] as const) {
        const size = fitHeroTitleSize(strings.hero.title, width, mobile);
        const maxWidth = width - (mobile ? 32 : 64);
        expect(strings.hero.title.length * size * 0.75).toBeLessThanOrEqual(maxWidth);
        expect(size).toBeGreaterThan(0);
      }
    }
  });

  test('uses each locale title instead of the English fallback', () => {
    expect(new Set(Object.values(HOME_STRINGS).map((strings) => strings.hero.title)).size).toBe(7);
  });
});

describe('hero vertical lockup (#781-era overlap regression)', () => {
  // Mirrors the layout() formulas in buildHeroSection: the subtitle baseline
  // must clear the title's descender band plus the subtitle's own ascent, at
  // every locale × viewport the hero actually renders. The old fixed
  // 0.42×titleSize offset let a fit-to-width title collide with the fixed
  // 19px subtitle, and zoom/DPR (which shrinks titleSize ∝ width) made it
  // denser.
  const subtitleSizeFor = (titleSize: number): number =>
    Math.round(Math.max(13, Math.min(19, titleSize * 0.34)));
  const daylightFor = (titleSize: number): number => Math.max(8, titleSize * 0.18);
  const subtitleOffsetFor = (titleSize: number): number =>
    titleSize * 0.24 + subtitleSizeFor(titleSize) * 0.75 + daylightFor(titleSize);

  test('subtitle clears the title ink band at every locale × width', () => {
    for (const strings of Object.values(HOME_STRINGS)) {
      for (const [width, mobile] of [
        [2560, false],
        [1440, false],
        [1024, false],
        [720, false],
        [390, true],
      ] as const) {
        const titleSize = fitHeroTitleSize(strings.hero.title, width, mobile);
        // Serif descender ≈ 0.24em below the title baseline; subtitle ascent
        // ≈ 0.75em above its own. The layout guarantees ≥8px daylight between
        // them (more as the title grows).
        const clearance =
          subtitleOffsetFor(titleSize) - titleSize * 0.24 - subtitleSizeFor(titleSize) * 0.75;
        expect(clearance).toBeGreaterThanOrEqual(8 - 1e-9);
        expect(clearance).toBeCloseTo(daylightFor(titleSize), 9);
      }
    }
  });

  test('subtitle scales down with the fitted title instead of staying fixed', () => {
    const longTitle = Object.values(HOME_STRINGS)[0]!.hero.title;
    const wide = fitHeroTitleSize(longTitle, 2560, false);
    const narrow = fitHeroTitleSize(longTitle, 390, true);
    expect(narrow).toBeLessThan(wide);
    expect(subtitleSizeFor(narrow)).toBeLessThan(subtitleSizeFor(wide));
    // The old code kept 19px at every width; the floor must stay readable.
    expect(subtitleSizeFor(narrow)).toBeGreaterThanOrEqual(13);
  });
});
