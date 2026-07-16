import type { APIRoute } from 'astro';
import { DEFAULT_LOCALE } from '../i18n/config';
import { buildSearchIndex, type SearchEntry } from '../i18n/search';

export type { SearchEntry };

export const GET: APIRoute = async () => {
  const index = await buildSearchIndex(DEFAULT_LOCALE);
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
