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
    sidebar?: SectionEntry[];
  };
}

const locales = ['', 'zh-cn', 'zh-tw', 'ja', 'fr', 'es', 'ko'] as const;

function localizedRoute(locale: (typeof locales)[number], route: string): string {
  return locale ? `${locale}/${route}` : route;
}

function localizedPath(locale: (typeof locales)[number], path: string): string {
  return locale ? `/${locale}${path}` : path;
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

let deepDiveSection: SectionPayload;

beforeAll(() => {
  execFileSync('zola', ['build'], { cwd: repoRoot, stdio: 'inherit' });
  deepDiveSection = readPageData('learn/deep-dive');
});

describe('generated Learn subsection payload', () => {
  for (const locale of locales) {
    const label = locale || 'en';

    test(`${label} Learn links the Deep Dive card directly to Overview`, () => {
      const localizedLearn = readPageData(localizedRoute(locale, 'learn'));
      const localizedDeepDive = readPageData(localizedRoute(locale, 'learn/deep-dive'));
      const overviewPath = localizedPath(locale, '/learn/deep-dive/00-overview/');
      const deepDive = localizedLearn.data?.pages?.find((entry) => entry.path === overviewPath);

      expect(localizedLearn.data?.type).toBe('section');
      expect(deepDive).toBeDefined();
      expect(deepDive?.title).toBe(localizedDeepDive.data?.title);
      expect(deepDive?.description).toBe(localizedDeepDive.data?.description);
      expect(deepDive?.title.length).toBeGreaterThan(0);
      expect(deepDive?.description.length).toBeGreaterThan(0);
    });

    test(`${label} Learn article sidebar keeps Deep Dive last`, () => {
      const introduction = readPageData(localizedRoute(locale, 'learn/introduction'));
      const sidebar = introduction.data?.sidebar ?? [];

      expect(sidebar.length).toBeGreaterThan(1);
      expect(sidebar.at(-1)?.path).toBe(localizedPath(locale, '/learn/deep-dive/00-overview/'));
    });
  }

  test('/learn/deep-dive/ remains a section containing all sixteen articles', () => {
    expect(deepDiveSection.data?.type).toBe('section');
    expect(deepDiveSection.data?.pages).toHaveLength(16);
  });
});
