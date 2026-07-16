import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';

const docSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  order: z.number().optional(),
});

const learn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/learn' }),
  schema: docSchema,
});

const reference = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reference' }),
  schema: docSchema,
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date().optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    order: z.number().optional(),
  }),
});

// Localized doc translations. Entry id is `<locale>/<section>/<slug>` (e.g.
// `ja/reference/core-api`), mirroring the English `learn`/`reference` slugs.
// This collection starts empty and fills in incrementally; any doc without a
// translation here falls back to its English body at the localized URL (see
// src/pages/[locale]/…). Kept separate from the `learn`/`reference`
// collections so the English build, search index, and consistency checks are
// completely unaffected by partial translations.
const i18nDocs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/i18n' }),
  schema: docSchema,
});

export const collections = { learn, reference, blog, i18nDocs };
