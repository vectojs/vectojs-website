import type { Entity } from '@vectojs/core';
import type { Token } from 'marked';
import { withWholeLineProjection } from './text-utils';
import { localizedPath, type Locale } from './i18n/config';

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

/**
 * Strip Zola's explicit heading attributes (`{#id}`, `{.class}`,
 * `{#id .class}`) from markdown before it reaches `marked`.
 *
 * Zola allows `## Title {#custom-id}` / `{.class}` to set the HTML `id`;
 * `page.toc` parses it correctly, but `load_data(format="plain")` in
 * `templates/page.html` captures the raw `{#...}` verbatim. `marked`'s
 * heading grammar treats it as literal text, so the canvas heading renders
 * `Title {#custom-id}`. See CTX-0033.
 *
 * Only heading lines outside fenced code blocks are touched; a code block
 * may legitimately contain `# heading {#not stripped}` as source text.
 * The trailing attribute check is intentionally lenient
 * (`\{(?:#|\.)[^}]*\}`) so `{#id}` and `{.class}` both strip without
 * re-deriving Zola's full attribute grammar. A plain trailing `{foo}` with
 * no leading `#`/`.` is left intact.
 */
export function stripHeadingAttributes(md: string): string {
  const lines = md.split('\n');
  let inFencedBlock = false;
  let fenceChar = '';
  // Zola heading attribute: `{#id}`, `{.class}`, `{#id .c1 .c2}` etc.
  // Match loosely: brace starts with `#` or `.` then anything up to `}`.
  const attrSuffixRe = /\s*\{(?:#|\.)[^}]*\}\s*$/;
  const headingRe = /^\s{0,3}#{1,6}\s+/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trimStart();

    // Track fenced code blocks (``` or ~~~, at least 3 chars). The simplest
    // toggle that mirrors CommonMark: a fence line opens/closes the block.
    // We remember the opening char so ``` doesn't close a ~~~ block.
    if (/^(`{3,}|~{3,})/.test(trimmed)) {
      const ch = trimmed[0]!;
      if (!inFencedBlock) {
        inFencedBlock = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFencedBlock = false;
        fenceChar = '';
      }
      continue;
    }
    if (inFencedBlock) continue;
    if (!headingRe.test(line)) continue;
    if (!attrSuffixRe.test(line)) continue;
    lines[i] = line.replace(attrSuffixRe, '');
  }
  return lines.join('\n');
}

/**
 * Localize absolute internal links in markdown content for i18n pages.
 * Replaces `/learn/...` and `/reference/...` with `/zh-cn/learn/...` etc.
 * External links (https://) and anchors (#) are untouched.
 */
function localizeMarkdownLinks(markdown: string, locale: Locale): string {
  if (locale === 'en') return markdown;

  // Match markdown links: [text](/path) or [text](/path#anchor)
  // Also match reference-style links: [text]: /path
  return markdown.replace(
    /(\[([^\]]+)\]:\s*|\]\()(\/(learn|reference|blog)[^\s)]*)/g,
    (match, prefix, _, path) => {
      // path is like "/learn/introduction/" or "/reference/core-api/#heading"
      const localized = localizedPath(path, locale);
      return `${prefix}${localized}`;
    },
  );
}

/** Lazily import markdown and build a `TrackedMarkdown` for a doc body. */
export async function createArticleMarkdown(
  raw: string,
  options: Record<string, unknown>,
): Promise<ArticleMarkdown> {
  const Ctor = await ensureMarkdown();
  let cleanMarkdown = stripFrontmatter(raw);
  cleanMarkdown = stripHeadingAttributes(cleanMarkdown);

  // Localize links for non-English pages
  const locale = (options.locale as Locale) ?? 'en';
  cleanMarkdown = localizeMarkdownLinks(cleanMarkdown, locale);

  return new Ctor(cleanMarkdown, options);
}
