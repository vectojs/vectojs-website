import type { Entity } from '@vectojs/core';
import type { Token } from 'marked';
import { withWholeLineProjection } from './text-utils';

/**
 * `@vectojs/markdown` (with its katex-backed `@vectojs/tex` dependency) is the
 * heaviest thing the app can load (~380KB minified). The docs site list pages
 * may render plain frontmatter descriptions, so markdown is only needed when a
 * doc page is opened. The class is therefore built lazily behind a dynamic
 * import: `bun build --splitting` emits markdown as its own chunk that is
 * fetched on first doc navigation, keeping the eager bundle to core + ui.
 */

/** The markdown entity as the doc page consumes it. */
export type ArticleMarkdown = Entity & {
  headingEntities: Entity[];
  onLayoutUpdated?: (() => void) | null;
};

/** Stored in a module-level WeakMap — see the class comment in `ensureMarkdown`. */
const headingEntitiesByMarkdown = new WeakMap<object, Entity[]>();

type TrackedMarkdownCtor = new (raw: string, options: Record<string, unknown>) => ArticleMarkdown;

let trackedMarkdownCtor: TrackedMarkdownCtor | null = null;

async function ensureMarkdown(): Promise<TrackedMarkdownCtor> {
  if (trackedMarkdownCtor) return trackedMarkdownCtor;
  const { Markdown } = await import('@vectojs/markdown');

  /**
   * `Markdown` subclass that records each heading's rendered `Entity` in
   * document order. Zola's `page.toc` (see `templates/page.html`) is built
   * from the same heading sequence and is exactly two levels deep, so
   * flattening `toc` in document order and zipping it against this list gives
   * each TOC entry its on-canvas heading entity without re-deriving Zola's
   * slugify algorithm.
   *
   * Note: `Markdown`'s constructor calls `renderToken` synchronously inside
   * `super()`. Under `useDefineForClassFields` (ES2022+ target), ANY class
   * field declaration on this class is emitted as `this.foo = undefined`
   * immediately after `super()` returns, silently wiping whatever `renderToken`
   * pushed during construction. Storing the array in a module-level `WeakMap`
   * keyed by `this` avoids the class-field reset entirely.
   *
   * Every text entity it builds gets `withWholeLineProjection` so the a11y
   * tree reads whole lines instead of per-character nodes.
   */
  class TrackedMarkdown extends Markdown {
    public get headingEntities(): Entity[] {
      return headingEntitiesByMarkdown.get(this) ?? [];
    }

    protected override renderToken(token: Token): Entity | null {
      const entity = super.renderToken(token);
      if (entity) withWholeLineProjection(entity);
      if (entity && token.type === 'heading') {
        const list = headingEntitiesByMarkdown.get(this) ?? [];
        list.push(entity);
        headingEntitiesByMarkdown.set(this, list);
      }
      return entity;
    }
  }

  trackedMarkdownCtor = TrackedMarkdown;
  return trackedMarkdownCtor;
}

/**
 * Strip TOML frontmatter (+++...+++) from raw Zola markdown content.
 * Zola's `load_data(format="plain")` returns the full `.md` file including
 * the frontmatter block, which `@vectojs/markdown` would render as a code fence.
 */
function stripFrontmatter(raw: string): string {
  const match = /^\+\+\+\s*\n[\s\S]*?\n\+\+\+\s*\n/m.exec(raw);
  return match ? raw.slice(match[0].length) : raw;
}

/** Lazily import markdown and build a `TrackedMarkdown` for a doc body. */
export async function createArticleMarkdown(
  raw: string,
  options: Record<string, unknown>,
): Promise<ArticleMarkdown> {
  const Ctor = await ensureMarkdown();
  const cleanMarkdown = stripFrontmatter(raw);
  return new Ctor(cleanMarkdown, options);
}
