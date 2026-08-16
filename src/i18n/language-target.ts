import {
  DEFAULT_LOCALE,
  LOCALIZED_SECTIONS,
  isLocale,
  localizedPath,
  parseLocale,
  type Locale,
} from './config';

export type TranslationTargets = Partial<Record<Locale, string>>;

export interface PageTranslation {
  lang: string;
  permalink: string;
}

const SITE_ORIGIN = 'https://vectojs.org';

function localTranslationTarget(permalink: string): string | null {
  const isRootRelative = permalink.startsWith('/');
  const isAbsoluteHttp = /^https?:\/\//i.test(permalink);
  if (!isRootRelative && !isAbsoluteHttp) return null;

  const url = new URL(permalink, SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN) return null;
  const pathname = `/${url.pathname.replace(/^\/+/, '')}`;
  return `${pathname}${url.search}${url.hash}`;
}

/** Convert Zola permalinks into same-site navigation targets. */
export function normalizeTranslationTargets(
  translations: readonly PageTranslation[] | undefined,
): TranslationTargets {
  const targets: TranslationTargets = {};
  for (const translation of translations ?? []) {
    if (!isLocale(translation.lang)) continue;
    try {
      const target = localTranslationTarget(translation.permalink);
      if (target) targets[translation.lang] = target;
    } catch {
      // Ignore malformed page data rather than exposing it as a navigation URL.
    }
  }
  return targets;
}

/** Resolve a language switch using real docs translations before path synthesis. */
export function languageTarget(
  currentPathname: string,
  targetLocale: Locale,
  translations: TranslationTargets,
): string {
  const { rest } = parseLocale(currentPathname);
  const section = rest.split('/')[1] ?? '';
  if (!(LOCALIZED_SECTIONS as readonly string[]).includes(section)) {
    return localizedPath('/', targetLocale);
  }
  return (
    translations[targetLocale] ?? translations[DEFAULT_LOCALE] ?? localizedPath(rest, targetLocale)
  );
}
