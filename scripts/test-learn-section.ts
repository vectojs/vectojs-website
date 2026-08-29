/**
 * Regression coverage for nested Learn sections (CTX-0045 / Issue #47).
 *
 * Zola represents `content/learn/deep-dive/_index.md` as a subsection rather
 * than a page. The Learn landing payload must expose that subsection as one
 * first-class card without flattening or duplicating its sixteen articles.
 *
 * Usage: bun run scripts/test-learn-section.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface SectionEntry {
  title: string;
  description: string;
  path: string;
}

interface SectionPayload {
  data?: {
    type?: string;
    title?: string;
    description?: string;
    pages?: SectionEntry[];
  };
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readPageData(path: string): SectionPayload {
  const html = readFileSync(join(repoRoot, 'public', path, 'index.html'), 'utf8');
  const match = html.match(
    /<script id="page-data" type="application\/json">\s*([\s\S]*?)\s*<\/script>/,
  );
  if (!match?.[1]) throw new Error(`${path}: missing #page-data JSON`);
  return JSON.parse(match[1]) as SectionPayload;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

execFileSync('zola', ['build'], { cwd: repoRoot, stdio: 'inherit' });

const learn = readPageData('learn');
assert(learn.data?.type === 'section', '/learn/ must build a section payload');

const deepDive = learn.data.pages?.find((entry) => entry.path === '/learn/deep-dive/');
assert(deepDive, '/learn/ must expose /learn/deep-dive/ as a card');

const deepDiveSection = readPageData('learn/deep-dive');
assert(deepDiveSection.data?.type === 'section', '/learn/deep-dive/ must remain a section');
assert(
  deepDive.title === deepDiveSection.data.title,
  'Deep Dive card must reuse the subsection title',
);
assert(
  deepDive.description === deepDiveSection.data.description,
  'Deep Dive card must reuse the subsection description',
);
assert(deepDive.title.length > 0, 'Deep Dive subsection must provide a title');
assert(deepDive.description.length > 0, 'Deep Dive subsection must provide a description');
assert(
  deepDiveSection.data.pages?.length === 16,
  `/learn/deep-dive/ must retain its 16 articles (found ${deepDiveSection.data.pages?.length ?? 0})`,
);

console.log('Learn subsection regression: 7/7 checks passed.');
