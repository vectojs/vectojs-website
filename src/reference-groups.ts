/**
 * Reference-page groups for the docs sidebar.
 *
 * Ported from the old Astro site's `src/consts.ts` REFERENCE_PAGES, where a
 * package with several pages (currently only `ui`) rendered as one collapsible
 * section instead of dozens of flat sidebar rows. A group with exactly one
 * page renders as a plain top-level link — a disclosure triangle over a single
 * item is pure friction, and most packages only have one reference page.
 *
 * Order matters: groups render in array order, and the first page listed for a
 * group is its collapsible header/overview link. Pages missing from this map
 * (a newly added reference doc) default to a group of one keyed by their slug.
 */
export const REFERENCE_GROUPS: ReadonlyArray<{
  key: string;
  header: string;
  pages: string[];
}> = [
  {
    key: 'core',
    header: 'core-api',
    pages: [
      'core-scene',
      'core-entity',
      'core-layout',
      'core-renderer',
      'core-particles',
      'core-text',
      'core-entities',
      'core-math',
      'core-a11y',
    ],
  },
  {
    key: 'ui',
    header: 'ui-components',
    pages: [
      'ui-button',
      'ui-slider',
      'ui-overlay',
      'ui-text',
      'ui-richtext',
      'ui-link',
      'ui-image',
      'ui-card',
      'ui-stack',
      'ui-flow',
      'ui-input',
      'ui-textarea',
      'ui-checkbox',
      'ui-toggle',
      'ui-dropdown',
      'ui-radiogroup',
      'ui-tabs',
      'ui-progressbar',
      'ui-table',
      'ui-scrollview',
      'ui-virtuallist',
      'ui-treeview',
      'ui-resizable-panel',
      'ui-modal',
      'ui-tooltip',
      'ui-popover',
      'ui-contextmenu',
    ],
  },
  { key: 'markdown', header: 'ui-markdown', pages: ['ui-codeblock'] },
  { key: 'animation', header: 'animation', pages: [] },
  { key: 'three', header: 'three', pages: ['three-adapter', 'three-renderer'] },
  {
    key: 'graph3d',
    header: 'graph3d',
    pages: ['graph3d-layout', 'graph3d-renderer'],
  },
  { key: 'graph-layout', header: 'graph-layout', pages: [] },
  { key: 'video-exporter', header: 'video-exporter', pages: [] },
  {
    key: 'devtools',
    header: 'devtools',
    pages: ['devtools-inspect', 'devtools-audit', 'devtools-perf', 'devtools-extend'],
  },
  { key: 'styles', header: 'styles', pages: [] },
  { key: 'faq', header: 'faq', pages: [] },
];

/**
 * Group the flat Zola sidebar entries for a reference section into collapsible
 * sections, preserving the order of {@link REFERENCE_GROUPS}. Unmapped pages
 * keep their position as single-page groups.
 */
export function groupReferencePages(pages: ReadonlyArray<{ title: string; path: string }>): Array<{
  header: { title: string; path: string };
  children: Array<{ title: string; path: string }>;
}> {
  const bySlug = new Map(
    pages.map((p) => {
      const slug = p.path.replace(/\/$/, '').split('/').pop() ?? p.path;
      return [slug, p];
    }),
  );
  const consumed = new Set<string>();
  const groups: Array<{
    header: { title: string; path: string };
    children: Array<{ title: string; path: string }>;
  }> = [];
  for (const group of REFERENCE_GROUPS) {
    const header = bySlug.get(group.header);
    if (!header) continue;
    consumed.add(group.header);
    const children = group.pages
      .map((slug) => bySlug.get(slug))
      .filter((p): p is { title: string; path: string } => !!p);
    for (const slug of group.pages) consumed.add(slug);
    groups.push({ header, children });
  }
  for (const page of pages) {
    const slug = page.path.replace(/\/$/, '').split('/').pop() ?? page.path;
    if (!consumed.has(slug)) {
      consumed.add(slug);
      groups.push({ header: page, children: [] });
    }
  }
  return groups;
}
