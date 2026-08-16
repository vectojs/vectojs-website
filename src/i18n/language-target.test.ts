import { describe, expect, test } from 'bun:test';
import {
  languageTarget,
  normalizeTranslationTargets,
  type TranslationTargets,
} from './language-target';

const fullTranslations: TranslationTargets = {
  en: '/reference/graph3d/',
  'zh-cn': '/zh-cn/reference/graph3d/',
  'zh-tw': '/zh-tw/reference/graph3d/',
  ja: '/ja/reference/graph3d/',
  fr: '/fr/reference/graph3d/',
  es: '/es/reference/graph3d/',
  ko: '/ko/reference/graph3d/',
};

describe('languageTarget', () => {
  test('uses the requested real translation for docs pages', () => {
    for (const [locale, target] of Object.entries(fullTranslations)) {
      expect(
        languageTarget('/reference/graph3d/', locale as keyof TranslationTargets, fullTranslations),
      ).toBe(target);
    }
  });

  test('falls back to the English translation when the target is absent', () => {
    expect(
      languageTarget('/reference/graph-layout/', 'fr', {
        en: '/reference/graph-layout/',
      }),
    ).toBe('/reference/graph-layout/');
  });

  test('uses localizedPath when neither target nor English is available', () => {
    expect(languageTarget('/ja/learn/events/', 'fr', {})).toBe('/fr/learn/events/');
  });

  test('keeps the existing non-doc language behavior', () => {
    expect(languageTarget('/blog/launch/', 'ja', fullTranslations)).toBe('/ja/');
  });
});

describe('normalizeTranslationTargets', () => {
  test('keeps same-origin absolute URLs and root-relative inputs', () => {
    expect(
      normalizeTranslationTargets([
        {
          lang: 'en',
          permalink: 'https://vectojs.org/reference/graph-layout/?view=all#api',
        },
        {
          lang: 'fr',
          permalink: '/fr/reference/graph-layout/?view=compact#options',
        },
        {
          lang: 'xx',
          permalink: 'https://vectojs.org/xx/reference/graph-layout/',
        },
        { lang: 'ja', permalink: 'javascript:alert(1)' },
      ]),
    ).toEqual({
      en: '/reference/graph-layout/?view=all#api',
      fr: '/fr/reference/graph-layout/?view=compact#options',
    });
  });

  test('rejects cross-origin and protocol-relative URLs', () => {
    expect(
      normalizeTranslationTargets([
        {
          lang: 'fr',
          permalink: 'https://untrusted.example/fr/reference/graph-layout/',
        },
        { lang: 'ja', permalink: '//evil.example/reference/graph-layout/' },
      ]),
    ).toEqual({});
  });

  test('normalizes same-origin paths to exactly one leading slash', () => {
    expect(
      normalizeTranslationTargets([
        {
          lang: 'en',
          permalink: 'https://vectojs.org//evil.example/path?view=all#api',
        },
      ]),
    ).toEqual({ en: '/evil.example/path?view=all#api' });
  });
});
