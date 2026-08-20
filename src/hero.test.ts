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
