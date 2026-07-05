import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { REFERENCE_PAGES, VERSIONS } from '../src/consts';

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

const contentRoot = join(root, 'src/content');
for await (const relativePath of new Bun.Glob('**/*.md').scan({ cwd: contentRoot })) {
  const content = await readFile(join(contentRoot, relativePath), 'utf8');
  if (/vectojs@0\.9\b/.test(content)) {
    failures.push(`${relativePath} contains stale vectojs@0.9 label`);
  }
}

if (failures.length > 0) {
  console.error(`Documentation consistency check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Documentation versions, navigation, and sandbox labels are consistent.');
