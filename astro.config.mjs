import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const imagesDir = fileURLToPath(new URL('./public/images/', import.meta.url));

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// HAST plugin: inlines <img class="diagram" src="/images/x.svg"> as live <svg>
// markup instead of an opaque image reference. The diagram SVGs (public/images/
// *.svg) have their colors expressed as var(--diagram-*)/var(--accent)/etc, not
// hardcoded hex — CSS custom properties only cascade into inline, in-document
// SVG, never into a separate document loaded via <img src>, so this is what
// actually makes them respond to the light/dark toggle.
//
// Raw inline HTML (e.g. the <figure><img/>...</figure> wrapper around each
// diagram) is passed through by satteri as an opaque "raw" text node, not a
// structured `element` node — only native markdown constructs (blockquote,
// paragraph, ...) get parsed that far. So this has to operate on the raw HTML
// string via regex rather than matching a hast `element` node for `img`.
const inlineDiagramsPlugin = {
  name: 'inline-diagrams',
  raw(node) {
    if (!node.value.includes('diagram')) return;
    const value = node.value.replace(/<img\b[^>]*>/g, (imgTag) => {
      const classMatch = imgTag.match(/\bclass="([^"]*)"/);
      const classNames = classMatch ? classMatch[1].split(/\s+/) : [];
      if (!classNames.includes('diagram')) return imgTag;

      const srcMatch = imgTag.match(/\bsrc="([^"]*)"/);
      const src = srcMatch?.[1];
      if (!src || !src.startsWith('/images/') || !src.endsWith('.svg')) return imgTag;

      let svg;
      try {
        svg = readFileSync(imagesDir + src.slice('/images/'.length), 'utf-8');
      } catch {
        return imgTag; // leave the <img> as-is rather than breaking the build over a bad path
      }
      const altMatch = imgTag.match(/\balt="([^"]*)"/);
      const alt = altMatch?.[1] ?? '';
      svg = svg.replace(
        /<svg\b/,
        `<svg class="diagram" role="img" aria-label="${escapeAttr(alt)}"`,
      );
      return svg;
    });
    if (value === node.value) return;
    return { type: 'raw', value };
  },
};

// HAST plugin: transforms `> [!NOTE]` etc. into <div class="callout callout-note">
const calloutsPlugin = {
  name: 'callouts',
  element: {
    filter: ['blockquote'],
    visit(node) {
      const KINDS = new Set(['note', 'tip', 'warning', 'caution', 'important']);
      // Find first <p> child (skip whitespace text nodes)
      const fp = node.children.find((c) => c.type === 'element' && c.tagName === 'p');
      if (!fp) return;
      // Find first non-empty text child in the paragraph
      const ftIdx = fp.children.findIndex((c) => c.type === 'text' && c.value.trim());
      if (ftIdx === -1) return;
      const ft = fp.children[ftIdx];
      const m = ft.value.match(/^\[!([A-Z]+)\]/i);
      if (!m || !KINDS.has(m[1].toLowerCase())) return;
      const kind = m[1].toLowerCase();
      const rest = ft.value.slice(m[0].length).trimStart();
      // Strip the marker from the first text node
      const newFpChildren = rest
        ? fp.children.map((c, i) => (i === ftIdx ? { ...c, value: rest } : c))
        : fp.children.filter((_, i) => i !== ftIdx);
      // Drop the first paragraph entirely if it's now empty
      const fpEmpty = newFpChildren.every((c) => c.type === 'text' && !c.value.trim());
      const newFp = fpEmpty ? null : { ...fp, children: newFpChildren };
      const newChildren = node.children.map((c) => (c === fp ? newFp : c)).filter(Boolean);
      return {
        type: 'element',
        tagName: 'div',
        properties: { className: ['callout', `callout-${kind}`] },
        children: newChildren,
      };
    },
  },
};

// Static site dogfooding VectoJS. No UI framework — pages are plain HTML/CSS and
// each demo is vanilla TS bundled by Astro's Vite pipeline. Deploys to Cloudflare
// Pages as a static `dist/`.
export default defineConfig({
  site: 'https://vectojs.org',
  trailingSlash: 'always',
  server: { port: 1111 },
  // English is the default locale and stays unprefixed (existing /reference/…,
  // /learn/… URLs are unchanged); the other six locales are served under a
  // /<locale>/ prefix. Docs + homepage are localized; the blog is not (its
  // localized routes are simply never generated — see src/i18n/config.ts).
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-cn', 'zh-tw', 'ja', 'fr', 'es', 'ko'],
    routing: { prefixDefaultLocale: false, redirectToDefaultLocale: false },
  },
  // Two philosophy essays moved from the Learn docs into the Blog section.
  redirects: {
    '/learn/rethinking-frontend/': '/blog/rethinking-frontend/',
    '/learn/beyond-jsx/': '/blog/beyond-jsx/',
  },
  integrations: [sitemap()],
  markdown: {
    processor: satteri({ hastPlugins: [calloutsPlugin, inlineDiagramsPlugin] }),
    shikiConfig: {
      // Dual-theme: Shiki emits both palettes as CSS custom properties per
      // token instead of baking one theme's colors into inline styles.
      // styles.css picks between them via [data-theme] (see ".astro-code
      // dual-theme activation" in styles.css) — that's what our own toggle
      // drives, so defaultColor must be off or dark would always win.
      themes: { light: 'github-light-default', dark: 'github-dark-default' },
      defaultColor: false,
      wrap: false,
    },
  },
});
