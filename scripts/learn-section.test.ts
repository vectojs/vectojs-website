/**
 * Regression coverage for nested Learn sections (CTX-0045 / Issue #47).
 *
 * Zola represents `content/learn/deep-dive/_index.md` as a subsection rather
 * than a page. The Learn landing payload must expose that subsection as one
 * first-class card without flattening or duplicating its sixteen articles.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
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

let learn: SectionPayload;
let deepDiveSection: SectionPayload;

beforeAll(() => {
  execFileSync('zola', ['build'], { cwd: repoRoot, stdio: 'inherit' });
  learn = readPageData('learn');
  deepDiveSection = readPageData('learn/deep-dive');
});

describe('generated Learn subsection payload', () => {
  test('/learn/ exposes Deep Dive as a card with canonical metadata', () => {
    expect(learn.data?.type).toBe('section');

    const deepDive = learn.data?.pages?.find((entry) => entry.path === '/learn/deep-dive/');
    expect(deepDive).toBeDefined();
    expect(deepDive?.title).toBe(deepDiveSection.data?.title);
    expect(deepDive?.description).toBe(deepDiveSection.data?.description);
    expect(deepDive?.title.length).toBeGreaterThan(0);
    expect(deepDive?.description.length).toBeGreaterThan(0);
  });

  test('/learn/deep-dive/ remains a section containing all sixteen articles', () => {
    expect(deepDiveSection.data?.type).toBe('section');
    expect(deepDiveSection.data?.pages).toHaveLength(16);
  });
});
