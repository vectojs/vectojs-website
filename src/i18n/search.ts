import { getCollection, getEntry, render } from 'astro:content';
import { DEFAULT_LOCALE, LOCALIZED_SECTIONS, localizedPath, type Locale } from './config';

export interface SearchEntry {
  title: string;
  /** Short body excerpt for body-text search. Not displayed but matched. */
  snippet?: string;
  href: string;
  section: string;
  /** Depth: 0 = page title, 1+ = heading level */
  depth: number;
}

// Extract plain-text snippet for each heading section from raw markdown.
// Returns a map of heading slug → first ~140 chars of body text under it.
function extractSnippets(body: string): Map<string, string> {
  const out = new Map<string, string>();
  // Split on ATX headings (##, ###, ####)
  const parts = body.split(/^#{1,4} .+$/m);
  const headingMatches = [...body.matchAll(/^#{1,4} (.+)$/gm)];

  for (let i = 0; i < headingMatches.length; i++) {
    const headingText = headingMatches[i][1].trim();
    const slug = headingText
      .toLowerCase()
      .replace(/[`*_[\]()]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const section = parts[i + 1] ?? '';
    // Strip markdown syntax and collapse whitespace
    const plain = section
      .replace(/```[\s\S]*?```/g, '') // fenced code blocks
      .replace(/`[^`]*`/g, '') // inline code (removes tags inside backticks too)
      .replace(/<[^>]+>/g, '') // residual HTML tags
      .replace(/^\|.+\|$/gm, '') // table rows
      .replace(/^\s*[-:]+\s*\|/gm, '') // table dividers
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text only
      .replace(/[#>*_~|\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);
    if (plain) out.set(slug, plain);
  }
  return out;
}

const SECTION_LABEL: Record<(typeof LOCALIZED_SECTIONS)[number], string> = {
  learn: 'Learn',
  reference: 'Reference',
};

/**
 * Build the search index for a locale. Titles, headings, and snippets come from
 * the localized `i18nDocs` entry when one exists, otherwise from the English
 * source. Every href is prefixed for the locale so results keep users in their
 * language. Section labels stay English (matched against the localized search
 * UI's own copy is not needed — the label is display-only and short).
 */
export async function buildSearchIndex(locale: Locale): Promise<SearchEntry[]> {
  const index: SearchEntry[] = [];

  for (const section of LOCALIZED_SECTIONS) {
    const entries = await getCollection(section);
    const label = SECTION_LABEL[section];

    for (const entry of entries) {
      // Prefer a localized translation of this doc when present.
      const translated =
        locale === DEFAULT_LOCALE
          ? undefined
          : await getEntry('i18nDocs', `${locale}/${section}/${entry.id}`);
      const source = translated ?? entry;

      const base = localizedPath(`/${section}/${entry.id}/`, locale);
      const snippets = extractSnippets(source.body ?? '');
      index.push({ title: source.data.title, href: base, section: label, depth: 0 });

      const { headings } = await render(source);
      for (const h of headings) {
        if (h.depth > 3) continue;
        index.push({
          title: h.text,
          snippet: snippets.get(h.slug),
          href: `${base}#${h.slug}`,
          section: `${label} › ${source.data.title}`,
          depth: h.depth,
        });
      }
    }
  }

  return index;
}
