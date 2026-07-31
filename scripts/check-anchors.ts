/**
 * Resolves every in-page and cross-page anchor fragment in the English docs and
 * all six locales against the heading ids those pages actually generate.
 *
 * Why this exists: markdownlint catches in-page (`](#frag)`) breakage, but a
 * cross-page fragment (`](/reference/page/#frag)`) builds clean, passes
 * `astro check`, and is silently dead in production. Three such links survived
 * in the English source long enough for a translation pass to faithfully
 * inherit each one into all six locales, turning 3 defects into 21. Two causes,
 * both invisible without a resolver:
 *
 *   - pointing at a page that never had the heading (an index page, in that
 *     case), and
 *   - hand-computing the slug. `## \`GraphInteraction\` — hover / select /
 *     drag-to-pin` makes BOTH the em-dash and each slash a separator, so the
 *     real id is `graphinteraction--hover--select--drag-to-pin` with doubled
 *     hyphens. The hand-written link had single ones.
 *
 * Ids are computed with the same `github-slugger` Astro uses rather than read
 * out of `dist/`, so this runs before the build and needs no build output.
 * That equivalence is not assumed: it was verified against built HTML across
 * all 476 built doc pages (English + 6 locales), heading-for-heading in
 * document order, with zero mismatches.
 */
import GithubSlugger from 'github-slugger';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const contentRoot = join(root, 'src/content');
const LOCALES = ['zh-cn', 'zh-tw', 'ja', 'fr', 'es', 'ko'];
const SECTIONS = ['learn', 'reference'];

/**
 * The rendered text of a heading, with inline Markdown stripped the way rehype
 * sees it before slugging.
 */
function headingText(raw: string): string {
  return raw
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

/**
 * Every heading id a page generates, in document order.
 *
 * Fence tracking records the opening delimiter's length rather than toggling on
 * any fence: `fr`/`es` `reference/ui-tabs.md` nest a ```` ``` ```` block inside
 * a ````` ```` ````` one, and a naive toggle closes on the inner fence and then
 * drops every heading after it.
 */
function headingIds(markdown: string): string[] {
  const slugger = new GithubSlugger();
  const ids: string[] = [];
  let fence = 0;
  for (const line of markdown.split('\n')) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const length = fenceMatch[1].length;
      if (fence === 0) fence = length;
      else if (length >= fence) fence = 0;
      continue;
    }
    if (fence > 0) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) ids.push(slugger.slug(headingText(heading[2])));
  }
  return ids;
}

async function markdownFiles(dir: string, acc: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await markdownFiles(path, acc);
    else if (entry.name.endsWith('.md')) acc.push(path);
  }
  return acc;
}

/** `''` is the unprefixed English route; otherwise a locale directory. */
const pageDir = (locale: string) => (locale ? join(contentRoot, 'i18n', locale) : contentRoot);

const idCache = new Map<string, Set<string> | null>();
async function idsFor(locale: string, section: string, slug: string) {
  const key = `${locale}/${section}/${slug}`;
  if (!idCache.has(key)) {
    const path = join(pageDir(locale), section, `${slug}.md`);
    const source = await readFile(path, 'utf8').catch(() => null);
    idCache.set(key, source === null ? null : new Set(headingIds(source)));
  }
  return idCache.get(key)!;
}

/** Heading depths in document order, for structural comparison. */
function headingDepths(markdown: string): number[] {
  const depths: number[] = [];
  let fence = 0;
  for (const line of markdown.split('\n')) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const length = fenceMatch[1].length;
      if (fence === 0) fence = length;
      else if (length >= fence) fence = 0;
      continue;
    }
    if (fence > 0) continue;
    const heading = /^(#{1,6})\s+/.exec(line);
    if (heading) depths.push(heading[1].length);
  }
  return depths;
}

const failures: string[] = [];
let inPageChecked = 0;
let crossPageChecked = 0;
let parityChecked = 0;

for (const locale of ['', ...LOCALES]) {
  const dir = pageDir(locale);
  for (const file of await markdownFiles(dir)) {
    const relative = file.slice(dir.length + 1);
    // The English root also holds `i18n/` and the English-only `blog/`.
    if (!locale && (relative.startsWith('i18n/') || relative.startsWith('blog/'))) {
      continue;
    }
    const parts = relative.split('/');
    if (parts.length !== 2) continue;
    const [section, base] = parts;
    if (!SECTIONS.includes(section)) continue;
    const slug = base.replace(/\.md$/, '');
    const label = `${locale || 'en'}/${section}/${slug}`;
    const source = await readFile(file, 'utf8');

    for (const match of source.matchAll(/\]\(#([^)\s]+)\)/g)) {
      inPageChecked++;
      const ids = (await idsFor(locale, section, slug))!;
      const fragment = decodeURIComponent(match[1]);
      if (!ids.has(fragment)) {
        failures.push(`${label} links to ](#${match[1]}) but has no such heading`);
      }
    }

    for (const match of source.matchAll(/\]\(\/(learn|reference)\/([a-z0-9-]+)\/#([^)\s]+)\)/g)) {
      crossPageChecked++;
      const ids = await idsFor(locale, match[1], match[2]);
      const target = `${locale || 'en'}/${match[1]}/${match[2]}`;
      if (!ids) {
        failures.push(`${label} links to ${target} which does not exist`);
        continue;
      }
      const fragment = decodeURIComponent(match[3]);
      if (!ids.has(fragment)) {
        failures.push(
          `${label} links to /${match[1]}/${match[2]}/#${match[3]} but ${target} has no such heading`,
        );
      }
    }
  }
}

/**
 * Heading structure must match English per page, because the anchor resolver and
 * the English fallback both index positionally. A drift here is not cosmetic: a
 * dropped heading means a dead anchor target, and `fr`/`es` `reference/ui-tabs`
 * shipped with an unclosed code fence that swallowed a whole `##` section into a
 * `<pre>`, losing its id entirely. Comparing depths in document order catches
 * that; counting fragments does not.
 */
for (const section of SECTIONS) {
  const englishDir = join(contentRoot, section);
  for (const file of await markdownFiles(englishDir)) {
    const slug = file.slice(englishDir.length + 1).replace(/\.md$/, '');
    const english = headingDepths(await readFile(file, 'utf8'));
    for (const locale of LOCALES) {
      const path = join(pageDir(locale), section, `${slug}.md`);
      const source = await readFile(path, 'utf8').catch(() => null);
      if (source === null) continue;
      parityChecked++;
      const localized = headingDepths(source);
      const same =
        localized.length === english.length &&
        localized.every((depth, index) => depth === english[index]);
      if (!same) {
        failures.push(
          `${locale}/${section}/${slug} has ${localized.length} headings where en/${section}/${slug} has ${english.length}`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Anchor check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(
  `All anchors resolve: ${inPageChecked} in-page and ${crossPageChecked} cross-page fragments, ` +
    `and heading structure matches English across ${parityChecked} localized pages.`,
);
