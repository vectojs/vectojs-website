import { describe, expect, test } from 'bun:test';
import { routeForContent } from './build-search-index';

describe('search index routes', () => {
  test('preserves nested directories for English content', () => {
    expect(routeForContent('learn/deep-dive/00-overview.md', null)).toEqual({
      href: '/learn/deep-dive/00-overview/',
      section: 'learn',
    });
  });

  test('preserves nested directories and removes the locale suffix', () => {
    expect(routeForContent('learn/deep-dive/00-overview.ja.md', 'ja')).toEqual({
      href: '/ja/learn/deep-dive/00-overview/',
      section: 'learn',
    });
  });

  test('keeps top-level routes unchanged', () => {
    expect(routeForContent('reference/core-api.md', null)).toEqual({
      href: '/reference/core-api/',
      section: 'reference',
    });
  });
});
