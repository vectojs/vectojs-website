import { access } from 'node:fs/promises';

const locales = ['zh-cn', 'zh-tw', 'ja', 'fr', 'es', 'ko'];
const articles = [
  '00-overview',
  '01-selection',
  '02-text-layout',
  '03-semantic-projection',
  '04-streaming-markdown',
  '05-tex',
  '06-vmt-runtime',
  '07-renderer',
  '08-wasm',
  '09-three-xr',
  '10-video-exporter',
  '11-graph-layout',
  '12-devtools',
  '13-styles',
  '14-responsive',
  '15-vertical-apps',
];

for (const locale of locales) {
  const routes = [
    `public/${locale}/learn/deep-dive/index.html`,
    ...articles.map((article) => `public/${locale}/learn/deep-dive/${article}/index.html`),
  ];
  for (const route of routes) {
    await access(route);
    console.log(`PASS ${route}`);
  }
}
