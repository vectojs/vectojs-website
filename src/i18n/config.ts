/**
 * i18n configuration: the single source of truth for supported locales, the
 * default locale, and helpers for building/parsing localized URLs.
 *
 * Product decisions:
 * - English is the default locale and is served WITHOUT a URL prefix, so every
 *   existing `/reference/...`, `/learn/...` URL keeps working unchanged.
 * - Every other locale is served under a prefix, e.g. `/ja/reference/...`.
 * - Only docs (learn + reference) and the homepage are localized. The blog is
 *   intentionally English-only (see `LOCALIZED_SECTIONS`).
 */

/** Every supported locale code (BCP-47-ish, lowercased for URL segments). */
export const LOCALES = ['en', 'zh-cn', 'zh-tw', 'ja', 'fr', 'es', 'ko'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Non-default locales — the ones that carry a URL prefix. */
export const PREFIXED_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE) as Exclude<
  Locale,
  'en'
>[];

/**
 * Human-readable, self-referential names for the language switcher (each shown
 * in its own language, the accessibility convention for language pickers).
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-cn': '简体中文',
  'zh-tw': '繁體中文',
  ja: '日本語',
  fr: 'Français',
  es: 'Español',
  ko: '한국어',
};

/**
 * The value emitted into `<html lang="…">`. Canonical BCP-47 subtags (the URL
 * segments are lowercased, but the lang attribute prefers the region-cased
 * form).
 */
export const HTML_LANG: Record<Locale, string> = {
  en: 'en',
  'zh-cn': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  ja: 'ja',
  fr: 'fr',
  es: 'es',
  ko: 'ko',
};

/** Which top-level content sections get localized routes. Blog is excluded. */
export const LOCALIZED_SECTIONS = ['learn', 'reference'] as const;

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}

/**
 * Prefix a root-relative path with a locale segment. The default locale returns
 * the path unchanged (no prefix); other locales get `/<locale>` prepended.
 * `path` must start with `/`. Preserves the site's `trailingSlash: 'always'`.
 */
export function localizedPath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${clean}`;
}

/**
 * Split a pathname into its locale and the remaining (locale-stripped) path.
 * A path with no known locale prefix is treated as the default locale.
 * Returns a path that always starts with `/`.
 */
export function parseLocale(pathname: string): { locale: Locale; rest: string } {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && isLocale(segments[0])) {
    const rest = '/' + segments.slice(1).join('/');
    return { locale: segments[0], rest: rest === '/' ? '/' : `${rest}/` };
  }
  return { locale: DEFAULT_LOCALE, rest: pathname };
}
