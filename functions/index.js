/**
 * Cloudflare Pages Function — homepage locale auto-redirect.
 *
 * Bound to the `/` route only (a file at functions/index.js matches exactly `/`),
 * so static assets and already-localized paths never pay for this logic. On a
 * request to the site root we pick the best locale and 302 to `/<locale>/`,
 * unless the best locale is English (the unprefixed default) — then we fall
 * through to the static English homepage via context.next().
 *
 * Resolution order (first match wins):
 *   1. `locale` cookie — a returning visitor or an explicit language-switcher
 *      choice. This is the manual override and always takes precedence, so we
 *      never fight a user's decision.
 *   2. Cloudflare edge geolocation (request.cf.country) → locale.
 *   3. Accept-Language header → locale.
 *
 * On a geo/Accept-Language redirect we set the `locale` cookie so the choice is
 * sticky and Googlebot (US → en) is never redirected away from English.
 */

// The prefixed locales this site ships (English is the unprefixed default and
// is intentionally absent). Keep in sync with src/i18n/config.ts.
const PREFIXED_LOCALES = ['zh-cn', 'zh-tw', 'ja', 'fr', 'es', 'ko'];
const DEFAULT_LOCALE = 'en';

// ISO 3166-1 alpha-2 country → locale. Countries not listed resolve to English.
const COUNTRY_LOCALE = {
  CN: 'zh-cn',
  TW: 'zh-tw',
  HK: 'zh-tw',
  MO: 'zh-tw',
  JP: 'ja',
  KR: 'ko',
  FR: 'fr',
  MC: 'fr',
  // Spanish-speaking countries (Spain + Latin America).
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  CL: 'es',
  PE: 'es',
  VE: 'es',
  EC: 'es',
  GT: 'es',
  CU: 'es',
  BO: 'es',
  DO: 'es',
  HN: 'es',
  PY: 'es',
  SV: 'es',
  NI: 'es',
  CR: 'es',
  PA: 'es',
  UY: 'es',
  PR: 'es',
};

function localeFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'locale') {
      const value = decodeURIComponent(rest.join('='));
      if (value === DEFAULT_LOCALE || PREFIXED_LOCALES.includes(value)) return value;
    }
  }
  return null;
}

function localeFromAcceptLanguage(header) {
  if (!header) return null;
  // Parse "zh-CN,zh;q=0.9,en;q=0.8" into ordered tags by descending q-weight.
  const tags = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const weight = q ? parseFloat(q.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 1 };
    })
    .sort((a, b) => b.weight - a.weight);

  for (const { tag } of tags) {
    if (tag === 'en' || tag.startsWith('en-')) return DEFAULT_LOCALE;
    if (tag.startsWith('zh')) {
      // Traditional for TW/HK/MO or explicit Hant; Simplified otherwise.
      if (tag.includes('tw') || tag.includes('hk') || tag.includes('mo') || tag.includes('hant')) {
        return 'zh-tw';
      }
      return 'zh-cn';
    }
    if (tag.startsWith('ja')) return 'ja';
    if (tag.startsWith('ko')) return 'ko';
    if (tag.startsWith('fr')) return 'fr';
    if (tag.startsWith('es')) return 'es';
  }
  return null;
}

export async function onRequest(context) {
  const { request, next } = context;

  // Only ever touch GET/HEAD navigations; anything else falls straight through.
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();

  const cookieLocale = localeFromCookie(request.headers.get('Cookie'));
  if (cookieLocale) {
    // Explicit/prior choice wins. Redirect to the localized home unless English.
    if (cookieLocale !== DEFAULT_LOCALE) {
      return Response.redirect(new URL(`/${cookieLocale}/`, request.url).toString(), 302);
    }
    return next();
  }

  const country = request.cf && request.cf.country ? request.cf.country : null;
  const target =
    (country && COUNTRY_LOCALE[country]) ||
    localeFromAcceptLanguage(request.headers.get('Accept-Language')) ||
    DEFAULT_LOCALE;

  if (target === DEFAULT_LOCALE) return next();

  const headers = new Headers({ Location: `/${target}/` });
  // Persist the detected choice for a year so we redirect once, not every visit.
  headers.append('Set-Cookie', `locale=${target}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}
