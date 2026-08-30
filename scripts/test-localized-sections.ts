import { access } from 'node:fs/promises';

const locales = ['zh-cn', 'zh-tw', 'ja', 'fr', 'es', 'ko'];

for (const locale of locales) {
  const route = `public/${locale}/learn/deep-dive/index.html`;
  await access(route);
  console.log(`PASS ${route}`);
}
