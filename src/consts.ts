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
  core: '1.6.0',
  ui: '1.7.2',
  three: '0.1.6',
  videoExporter: '0.2.2',
  devtools: '0.4.0',
} as const;

export const SITE = {
  title: 'VectoJS',
  description: 'A mathematical UI rendering framework driven by Vectomancy',
  github: 'https://github.com/vectojs/vectojs',
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
  {
    slug: 'nexus',
    title: 'Nexus — a WebGPU particle field',
    description:
      'Tens of thousands of particles simulated on a WebGPU compute pass — springing into the word “VectoJS”, flowing away from your cursor, with a transparent CPU fallback.',
    tag: 'WebGPU · Compute · particles',
  },
  {
    slug: 'chat',
    title: 'AI Chat — streaming Markdown',
    description:
      'A chat client whose entire transcript is rendered on canvas: Markdown streams in token-by-token, with code, tables, images, and SVG-rendered math, Mermaid, and ABC notation. Plays prebaked answers with zero config, or point it at a local Ollama.',
    tag: 'Streaming · Markdown · a11y',
  },
  {
    slug: 'catch',
    title: 'Fruit Catch',
    description:
      'A falling-fruit catcher, osu!Catch-style: move the plate with your mouse or arrow keys to grab the fruit the goal asks for. Zero DOM — fruit, catcher, HUD, and win screen are one canvas Entity.',
    tag: 'Interaction · Game · Zero-DOM',
  },
  {
    slug: 'graph',
    title: 'Knowledge Graph',
    description:
      'An infinite pan/zoom map of the VectoJS ecosystem: a real labeled backbone of packages and concepts, surrounded by thousands of synthetic satellite nodes to show how VectoJS keeps large graph surfaces fast without one DOM/SVG node per point.',
    tag: 'Infinite canvas · Scale · Graph',
  },
  {
    slug: 'dimension',
    title: 'Dimension',
    description:
      'A VectoJS control panel floating in real 3D space — drag to orbit, and every click is raycast through the plane into a fully interactive 2D UI underneath.',
    tag: 'WebGL · Three.js · 3D',
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
  { slug: 'core-api', title: '@vectojs/core' },
  { slug: 'ui-components', title: '@vectojs/ui' },
  { slug: 'ui-button', title: 'UI: Button' },
  { slug: 'ui-slider', title: 'UI: Slider' },
  { slug: 'ui-markdown', title: 'UI: Markdown' },
  { slug: 'ui-overlay', title: 'UI: Overlay' },
  { slug: 'ui-text', title: 'UI: Text' },
  { slug: 'ui-richtext', title: 'UI: RichText' },
  { slug: 'ui-link', title: 'UI: Link' },
  { slug: 'ui-image', title: 'UI: Image' },
  { slug: 'ui-card', title: 'UI: Card' },
  { slug: 'ui-stack', title: 'UI: Stack' },
  { slug: 'ui-flow', title: 'UI: Flow' },
  { slug: 'ui-input', title: 'UI: Input' },
  { slug: 'ui-textarea', title: 'UI: TextArea' },
  { slug: 'ui-checkbox', title: 'UI: Checkbox' },
  { slug: 'ui-toggle', title: 'UI: Toggle' },
  { slug: 'ui-dropdown', title: 'UI: Dropdown' },
  { slug: 'ui-radiogroup', title: 'UI: RadioGroup' },
  { slug: 'ui-tabs', title: 'UI: Tabs' },
  { slug: 'ui-progressbar', title: 'UI: ProgressBar' },
  { slug: 'ui-table', title: 'UI: Table' },
  { slug: 'ui-scrollview', title: 'UI: ScrollView' },
  { slug: 'ui-virtuallist', title: 'UI: VirtualList' },
  { slug: 'ui-treeview', title: 'UI: TreeView' },
  { slug: 'ui-resizable-panel', title: 'UI: Resizable panels' },
  { slug: 'ui-modal', title: 'UI: Modal' },
  { slug: 'ui-tooltip', title: 'UI: Tooltip' },
  { slug: 'ui-popover', title: 'UI: Popover' },
  { slug: 'ui-contextmenu', title: 'UI: ContextMenu' },
  { slug: 'ui-codeblock', title: 'UI: CodeBlock' },
  { slug: 'three', title: '@vectojs/three' },
  { slug: 'video-exporter', title: '@vectojs/video-exporter' },
  { slug: 'devtools', title: '@vectojs/devtools' },
  { slug: 'faq', title: 'FAQ' },
];
