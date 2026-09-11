import { defineCollection } from 'astro:content';

import { glob } from 'astro/loaders';

import { z } from 'astro/zod';

const languageFields = {
  lang: z.enum(['en', 'ko']).default('en'),
  translation: z.string().optional(),
};

const writing = defineCollection({
  loader: glob({
    pattern: '**/index.md',
    base: './src/content/writing',
  }),

  schema: z.object({
    title: z.string(),

    date: z.coerce.date(),

    description: z.string().optional(),

    tags: z.array(z.string()).default([]),

    draft: z.boolean().default(true),

    image: z.string().optional(),

    featured: z.boolean().default(false),

    ...languageFields,

    relatedPodcast: z.string().optional(),

    relatedYoutube: z.string().optional(),

    relatedApp: z.string().optional(),
  }),
});

const podcast = defineCollection({
  loader: glob({
    pattern: '**/index.md',
    base: './src/content/podcast',
  }),

  schema: z.object({
    title: z.string(),

    date: z.coerce.date(),

    description: z.string().optional(),

    tags: z.array(z.string()).default([]),

    draft: z.boolean().default(true),

    image: z.string().optional(),

    featured: z.boolean().default(false),

    ...languageFields,

    episode: z.union([z.string(), z.number()]).optional(),

    audioUrl: z.string().optional(),

    relatedWriting: z.string().optional(),

    relatedYoutube: z.string().optional(),

    relatedApp: z.string().optional(),
  }),
});

const youtube = defineCollection({
  loader: glob({
    pattern: '**/index.md',
    base: './src/content/youtube',
  }),

  schema: z.object({
    title: z.string(),

    date: z.coerce.date(),

    description: z.string().optional(),

    tags: z.array(z.string()).default([]),

    draft: z.boolean().default(true),

    image: z.string().optional(),

    featured: z.boolean().default(false),

    ...languageFields,

    youtubeId: z.string().optional(),

    relatedWriting: z.string().optional(),

    relatedPodcast: z.string().optional(),

    relatedApp: z.string().optional(),
  }),
});

const apps = defineCollection({
  loader: glob({
    pattern: '**/index.md',
    base: './src/content/apps',
  }),

  schema: z.object({
    title: z.string(),

    date: z.coerce.date(),

    description: z.string().optional(),

    draft: z.boolean().default(true),

    image: z.string().optional(),

    featured: z.boolean().default(false),

    ...languageFields,

    url: z.string().optional(),

    price: z.string().optional(),

    relatedWriting: z.string().optional(),
  }),
});

export const collections = {
  writing,

  podcast,

  youtube,

  apps,
};