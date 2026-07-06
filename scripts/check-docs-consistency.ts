import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { LEARN_PAGES, REFERENCE_PAGES, VERSIONS } from '../src/consts';

const root = new URL('..', import.meta.url).pathname;
const failures: string[] = [];
const packageVersionKeys = {
  '@vectojs/core': 'core',
  '@vectojs/ui': 'ui',
  '@vectojs/three': 'three',
  '@vectojs/video-exporter': 'videoExporter',
} as const;

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declaredPackages = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};

for (const [packageName, versionKey] of Object.entries(packageVersionKeys)) {
  if (!(packageName in declaredPackages)) continue;
  if (!(versionKey in VERSIONS)) {
    failures.push(`${packageName} is installed but VERSIONS.${versionKey} is missing`);
    continue;
  }
  const installedManifest = JSON.parse(
    await readFile(join(root, 'node_modules', packageName, 'package.json'), 'utf8'),
  ) as { version: string };
  const displayedVersion = VERSIONS[versionKey as keyof typeof VERSIONS];
  if (installedManifest.version !== displayedVersion) {
    failures.push(
      `${packageName} installed ${installedManifest.version} but VERSIONS.${versionKey} displays ${displayedVersion}`,
    );
  }
}

const referenceDir = join(root, 'src/content/reference');
const referenceSlugs = (await readdir(referenceDir))
  .filter((file) => file.endsWith('.md'))
  .map((file) => basename(file, '.md'))
  .sort();
const registeredSlugs = REFERENCE_PAGES.map((page) => page.slug).sort();
for (const slug of referenceSlugs) {
  if (!registeredSlugs.includes(slug))
    failures.push(`reference/${slug}.md is missing from REFERENCE_PAGES`);
}
for (const slug of registeredSlugs) {
  if (!referenceSlugs.includes(slug))
    failures.push(`REFERENCE_PAGES points to missing reference/${slug}.md`);
}

const learnDir = join(root, 'src/content/learn');
const learnSlugs = (await readdir(learnDir))
  .filter((file) => file.endsWith('.md'))
  .map((file) => basename(file, '.md'))
  .sort();
const registeredLearnSlugs = LEARN_PAGES.map((page) => page.slug).sort();
for (const slug of learnSlugs) {
  if (!registeredLearnSlugs.includes(slug))
    failures.push(`learn/${slug}.md is missing from LEARN_PAGES`);
}
for (const slug of registeredLearnSlugs) {
  if (!learnSlugs.includes(slug)) failures.push(`LEARN_PAGES points to missing learn/${slug}.md`);
}

const contentRoot = join(root, 'src/content');
for await (const relativePath of new Bun.Glob('**/*.md').scan({ cwd: contentRoot })) {
  const content = await readFile(join(contentRoot, relativePath), 'utf8');
  if (/vectojs@0\.9\b/.test(content)) {
    failures.push(`${relativePath} contains stale vectojs@0.9 label`);
  }
  if (/```mermaid\b/.test(content)) {
    failures.push(
      `${relativePath} contains a Mermaid fence; use a maintained SVG or VectoJS diagram`,
    );
  }
}

const documentedReferenceVersions = {
  'reference/ui-components.md': VERSIONS.ui,
  'reference/video-exporter.md': VERSIONS.videoExporter,
} as const;
for (const [relativePath, expectedVersion] of Object.entries(documentedReferenceVersions)) {
  const content = await readFile(join(contentRoot, relativePath), 'utf8');
  const match = content.match(/Version documented:\s*\*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*/);
  if (!match) failures.push(`${relativePath} is missing a Version documented label`);
  else if (match[1] !== expectedVersion) {
    failures.push(
      `${relativePath} documents ${match[1]} but the site version is ${expectedVersion}`,
    );
  }
}

const sandboxRoot = join(root, 'public/sandbox');
for await (const relativePath of new Bun.Glob('**/*.html').scan({ cwd: sandboxRoot })) {
  const content = await readFile(join(sandboxRoot, relativePath), 'utf8');
  for (const match of content.matchAll(/@vectojs\/(core|ui)@([0-9]+\.[0-9]+\.[0-9]+)/g)) {
    const expectedVersion = VERSIONS[match[1]];
    if (match[2] !== expectedVersion) {
      failures.push(
        `sandbox/${relativePath} loads @vectojs/${match[1]}@${match[2]} instead of ${expectedVersion}`,
      );
    }
  }
}

const expectedGalleryComponents = [
  'Text',
  'RichText',
  'Button',
  'Link',
  'Image',
  'Card',
  'Stack',
  'Flow',
  'Input',
  'TextArea',
  'Checkbox',
  'Toggle',
  'Slider',
  'Dropdown',
  'RadioGroup',
  'Tabs',
  'ProgressBar',
  'Overlay',
  'Tooltip',
  'Popover',
  'ContextMenu',
  'VirtualList',
  'TreeView',
  'PanelGroup',
  'Panel',
  'PanelResizeHandle',
  'ScrollView',
  'Modal',
  'Markdown',
  'CodeBlock',
  'Table',
].sort();
const gallery = await readFile(join(sandboxRoot, 'ui-components.html'), 'utf8');
const galleryManifest = gallery.match(/name="vecto-components"\s+content="([^"]+)"/);
if (!galleryManifest) failures.push('sandbox/ui-components.html is missing its component manifest');
else {
  const representedComponents = galleryManifest[1].split(',').sort();
  if (representedComponents.join(',') !== expectedGalleryComponents.join(',')) {
    failures.push('sandbox/ui-components.html does not represent every public visual component');
  }
}

if (failures.length > 0) {
  console.error(`Documentation consistency check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Documentation versions, navigation, and sandbox labels are consistent.');
