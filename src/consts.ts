/** Site-wide constants, demo registry, and docs navigation (single source of truth). */

/**
 * A per-build cache-busting token for unhashed static assets (`/css/*`). Astro
 * evaluates this ONCE at build time and bakes it into every generated page, so a
 * redeploy always produces a new `?v=` URL. This matters because `Cache-Control`
 * headers can't retroactively invalidate a copy a browser already cached under an
 * older policy — changing the URL is the only thing that guarantees every visitor
 * fetches the new file immediately, regardless of what they'd cached before.
 */
export const BUILD_ID = Date.now().toString(36);

export const VERSIONS = {
  core: '1.9.2',
  ui: '1.9.5',
  three: '0.1.6',
  graph3d: '0.2.1',
  videoExporter: '0.2.2',
  devtools: '0.4.2',
} as const;

export const SITE = {
  title: 'VectoJS',
  description: 'A mathematical UI rendering framework driven by Vectomancy',
  github: 'https://github.com/vectojs/vectojs',
  gallery: 'https://gallery.vectojs.org',
};

export interface DemoMeta {
  slug: string;
  title: string;
  description: string;
  tag: string;
}

export const DEMOS: DemoMeta[] = [
  {
    slug: 'danmaku',
    title: 'Danmaku at scale',
    description:
      'Thousands of live comments on one canvas — each individually interactive and accessible, where DOM-based danmaku chokes past ~200.',
    tag: 'Stress test · Interaction · a11y',
  },
];

export const demoBySlug = (slug: string): DemoMeta => {
  const d = DEMOS.find((x) => x.slug === slug);
  if (!d) throw new Error(`unknown demo: ${slug}`);
  return d;
};

export interface DocPage {
  slug: string;
  title: string;
  /**
   * Sidebar section key. Pages sharing a `group` render together: the first
   * page listed for a group is its collapsible header/overview link, the
   * rest render as sub-links underneath. A group with a single page (the
   * common case for a package with one reference doc so far) renders as a
   * plain top-level link instead — a disclosure triangle over one item is
   * pure friction. Omit to default to a group of one keyed by `slug`.
   */
  group?: string;
}

export const LEARN_PAGES: DocPage[] = [
  { slug: 'introduction', title: 'Introduction' },
  { slug: 'why-vectojs', title: 'Why VectoJS' },
  { slug: 'runtime-architecture', title: 'Runtime Architecture' },
  { slug: 'engine-concepts', title: 'Engine Concepts' },
  { slug: 'use-cases', title: 'Use Cases' },
  { slug: 'math-foundations', title: 'Mathematical Foundations' },
  { slug: 'getting-started', title: 'Getting Started' },
  { slug: 'core-scene', title: 'Core Scene' },
  { slug: 'custom-entity', title: 'Custom Entities' },
  { slug: 'events', title: 'Events & Hit-Testing' },
  { slug: 'physics-engine', title: 'Physics & Animation' },
  { slug: 'particles', title: 'Particle Systems' },
  { slug: 'performance', title: 'Performance' },
  { slug: 'text-typography', title: 'Text & Typography' },
  { slug: 'accessibility', title: 'Accessibility' },
  { slug: 'ui-components', title: 'UI Components' },
  { slug: 'cookbook', title: 'Cookbook' },
];

export const REFERENCE_PAGES: DocPage[] = [
  { slug: 'core-api', title: '@vectojs/core', group: 'core' },
  { slug: 'core-scene', title: 'Core: Scene', group: 'core' },
  { slug: 'core-entity', title: 'Core: Entity', group: 'core' },
  { slug: 'core-layout', title: 'Core: Layout engine', group: 'core' },
  { slug: 'core-renderer', title: 'Core: Renderers', group: 'core' },
  { slug: 'core-particles', title: 'Core: ComputeParticleEntity', group: 'core' },
  { slug: 'core-text', title: 'Core: Text & Bidi', group: 'core' },
  { slug: 'core-entities', title: 'Core: Other entities', group: 'core' },
  { slug: 'core-math', title: 'Core: Math utilities', group: 'core' },
  { slug: 'core-a11y', title: 'Core: a11yRoot & agent contract', group: 'core' },
  { slug: 'ui-components', title: '@vectojs/ui', group: 'ui' },
  { slug: 'ui-button', title: 'UI: Button', group: 'ui' },
  { slug: 'ui-slider', title: 'UI: Slider', group: 'ui' },
  { slug: 'ui-markdown', title: 'UI: Markdown', group: 'ui' },
  { slug: 'ui-overlay', title: 'UI: Overlay', group: 'ui' },
  { slug: 'ui-text', title: 'UI: Text', group: 'ui' },
  { slug: 'ui-richtext', title: 'UI: RichText', group: 'ui' },
  { slug: 'ui-link', title: 'UI: Link', group: 'ui' },
  { slug: 'ui-image', title: 'UI: Image', group: 'ui' },
  { slug: 'ui-card', title: 'UI: Card', group: 'ui' },
  { slug: 'ui-stack', title: 'UI: Stack', group: 'ui' },
  { slug: 'ui-flow', title: 'UI: Flow', group: 'ui' },
  { slug: 'ui-input', title: 'UI: Input', group: 'ui' },
  { slug: 'ui-textarea', title: 'UI: TextArea', group: 'ui' },
  { slug: 'ui-checkbox', title: 'UI: Checkbox', group: 'ui' },
  { slug: 'ui-toggle', title: 'UI: Toggle', group: 'ui' },
  { slug: 'ui-dropdown', title: 'UI: Dropdown', group: 'ui' },
  { slug: 'ui-radiogroup', title: 'UI: RadioGroup', group: 'ui' },
  { slug: 'ui-tabs', title: 'UI: Tabs', group: 'ui' },
  { slug: 'ui-progressbar', title: 'UI: ProgressBar', group: 'ui' },
  { slug: 'ui-table', title: 'UI: Table', group: 'ui' },
  { slug: 'ui-scrollview', title: 'UI: ScrollView', group: 'ui' },
  { slug: 'ui-virtuallist', title: 'UI: VirtualList', group: 'ui' },
  { slug: 'ui-treeview', title: 'UI: TreeView', group: 'ui' },
  { slug: 'ui-resizable-panel', title: 'UI: Resizable panels', group: 'ui' },
  { slug: 'ui-modal', title: 'UI: Modal', group: 'ui' },
  { slug: 'ui-tooltip', title: 'UI: Tooltip', group: 'ui' },
  { slug: 'ui-popover', title: 'UI: Popover', group: 'ui' },
  { slug: 'ui-contextmenu', title: 'UI: ContextMenu', group: 'ui' },
  { slug: 'ui-codeblock', title: 'UI: CodeBlock', group: 'ui' },
  { slug: 'three', title: '@vectojs/three', group: 'three' },
  { slug: 'three-adapter', title: 'Three: ThreeAdapter', group: 'three' },
  { slug: 'three-renderer', title: 'Three: ThreeRenderer', group: 'three' },
  { slug: 'graph3d', title: '@vectojs/graph3d', group: 'graph3d' },
  { slug: 'graph3d-layout', title: 'Graph3D: GraphLayout', group: 'graph3d' },
  { slug: 'graph3d-renderer', title: 'Graph3D: Graph3D & picking', group: 'graph3d' },
  { slug: 'video-exporter', title: '@vectojs/video-exporter', group: 'video-exporter' },
  { slug: 'devtools', title: '@vectojs/devtools', group: 'devtools' },
  { slug: 'faq', title: 'FAQ', group: 'faq' },
];
