import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type Scene } from '@vectojs/core';
import { ScrollView } from '@vectojs/ui';
import { buildSidebar, type SidebarEntry } from './sidebar';
import { resolveThemeColors } from './theme';

const originalDocument = globalThis.document;

beforeAll(() => {
  globalThis.document = {
    createElement: () => ({
      style: { cssText: '' },
      setAttribute: () => {},
      remove: () => {},
      isConnected: true,
      getContext: () => ({
        font: '',
        measureText: (text: string) => ({ width: text.length * 8 }),
      }),
    }),
    body: { appendChild: () => {} },
  } as unknown as Document;
});

afterAll(() => {
  globalThis.document = originalDocument;
});

function sidebar(pages: SidebarEntry[]): ScrollView {
  const roots: unknown[] = [];
  const parent = {
    add: (entity: unknown) => roots.push(entity),
    markDirty: () => {},
  } as unknown as Scene;

  const root = buildSidebar(parent, {
    colors: resolveThemeColors('light'),
    lang: 'en',
    pages,
    activePath: '/learn/introduction/',
    viewportWidth: 1220,
    viewportHeight: 900,
    onNavigate: () => {},
    onToggle: () => {},
  });

  const scrollView = root.children.find((child) => child instanceof ScrollView);
  if (!(scrollView instanceof ScrollView)) throw new Error('sidebar did not mount a ScrollView');
  return scrollView;
}

describe('Learn sidebar scroll ownership', () => {
  test('short content passes wheel input through to the page', () => {
    const view = sidebar([
      { title: 'Introduction', path: '/learn/introduction/' },
      { title: 'Getting Started', path: '/learn/getting-started/' },
    ]);
    let prevented = 0;

    view.emit('wheel', {
      deltaY: 120,
      preventDefault: () => prevented++,
    });

    expect(prevented).toBe(0);
  });

  test('overflowing measured rows consume wheel input and move the target', () => {
    const pages = Array.from({ length: 40 }, (_, index) => ({
      title: `Chapter ${index}: a long title that wraps inside the sidebar`,
      path: `/learn/chapter-${index}/`,
    }));
    const view = sidebar(pages);
    let prevented = 0;

    view.emit('wheel', {
      deltaY: 120,
      preventDefault: () => prevented++,
    });

    expect(prevented).toBe(1);
    // DOCUMENT_SCROLL_PHYSICS springs the live content position toward this
    // target, so assert the state that wheel routing owns synchronously.
    expect((view as unknown as { targetY: number }).targetY).toBeLessThan(0);
  });
});
