/**
 * Generate static/search-index.json from the Zola content tree.
 *
 * Walks the learn/reference/blog content directories, parses TOML frontmatter
 * for the title, and emits one entry per page with its locale-aware permalink.
 * The SPA search modal filters this index by the active language.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'content');
const OUT = join(import.meta.dirname, '..', 'static', 'search-index.json');
const LOCALES = ['zh-cn', 'zh-tw', 'ja', 'fr', 'es', 'ko'];
const SECTIONS = ['learn', 'reference', 'blog'];

interface Entry {
  title: string;
  href: string;
  section: string;
  lang: string;
}

export function routeForContent(
  relativePath: string,
  lang: string | null,
): {
  href: string;
  section: string;
} {
  const parts = relativePath.split(/[\\/]/);
  const section = parts.shift();
  if (!section || parts.length === 0) {
    throw new Error(`content path must include a section and page: ${relativePath}`);
  }
  const pagePath = parts
    .join('/')
    .replace(/\.(?:zh-cn|zh-tw|ja|fr|es|ko)\.md$/, '')
    .replace(/\.md$/, '');
  const prefix = lang ? `/${lang}` : '';
  return { href: `${prefix}/${section}/${pagePath}/`, section };
}

function parseTomlFrontmatter(text: string): Record<string, unknown> {
  const m = /^\+{3}\n([\s\S]*?)\n\+{3}\n/.exec(text);
  if (!m) return {};
  const out: Record<string, unknown> = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([\w.-]+)\s*=\s*(.+)$/.exec(line.trim());
    if (!kv) continue;
    const value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      out[kv[1]] = value.slice(1, -1).replace(/\\"/g, '"');
    }
  }
  return out;
}

function localeOf(filename: string): string | null {
  for (const loc of LOCALES) {
    const suffix = `.${loc}.md`;
    if (filename.endsWith(suffix)) return loc;
  }
  return null;
}

function walk(dir: string, out: Entry[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!name.endsWith('.md')) continue;
    if (name.startsWith('_index')) continue;
    const lang = localeOf(name);
    const text = readFileSync(full, 'utf8');
    const fm = parseTomlFrontmatter(text);
    const title = (fm.title ?? name.replace(/\.md$/, '')) as string;
    const rel = relative(ROOT, full);
    const { href, section } = routeForContent(rel, lang);
    out.push({
      title: String(title),
      href,
      section,
      lang: lang ?? 'en',
    });
  }
}

if (import.meta.main) {
  const entries: Entry[] = [];
  for (const section of SECTIONS) {
    walk(join(ROOT, section), entries);
  }
  entries.sort((a, b) => a.title.localeCompare(b.title));

  mkdirSync(join(import.meta.dirname, '..', 'static'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(entries));
  console.log(`search-index.json: ${entries.length} entries`);
}
