import type { APIRoute } from 'astro';
import { PREFIXED_LOCALES, isLocale, DEFAULT_LOCALE } from '../../i18n/config';
import { buildSearchIndex } from '../../i18n/search';

export function getStaticPaths() {
  return PREFIXED_LOCALES.map((locale) => ({ params: { locale } }));
}

export const GET: APIRoute = async ({ params }) => {
  const locale = isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const index = await buildSearchIndex(locale);
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
