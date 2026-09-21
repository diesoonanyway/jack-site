import { defineCollection } from 'astro:content';

import { glob } from 'astro/loaders';

import { z } from 'astro/zod';

import { getPairedEntryId } from './lib/content-slug';

const stories = defineCollection({
  loader: glob({
    pattern: '**/index_{en,ko}.md',
    base: './src/content/stories',
    generateId: ({ entry, data }) => getPairedEntryId(entry, data.lang),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    intro: z.string().optional(),
    date: z.coerce.date(),
    createdAt: z.coerce.date().optional(),
    draft: z.boolean().default(true),
    lang: z.enum(['en', 'ko']).default('en'),
    translation: z.string().optional(),
    heroImage: z.string().optional(),
    spotifyUrl: z.string().optional(),
    youtubeUrl: z.string().optional(),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    episode: z.union([z.string(), z.number()]).optional(),
    relatedPodcast: z.string().optional(),
    relatedYoutube: z.string().optional(),
    relatedApp: z.string().optional(),
  }),
});

const languageFields = {
  lang: z.enum(['en', 'ko']).default('en'),
  translation: z.string().optional(),
};

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

    relatedJournal: z.string().optional(),
  }),
});

export const collections = {
  stories,
  apps,
};
