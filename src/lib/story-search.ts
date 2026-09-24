import { getCollection } from 'astro:content';

import { getPublicSlug, type ContentLanguage } from './content-slug';

export type StorySearchEntry = {
  title: string;
  description: string;
  body: string;
  formats: string[];
  url: string;
};

function decodeCommonEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'");
}

export function markdownToSearchText(markdown: string): string {
  return decodeCommonEntities(markdown)
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*|```$/g, ' '))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]\s|\d+[.)]\s)/gm, ' ')
    .replace(/[\\*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getStorySearchIndex(lang: ContentLanguage): Promise<StorySearchEntry[]> {
  const pathPrefix = lang === 'ko' ? '/ko' : '';
  const stories = await getCollection('stories');

  return stories
    .filter((story) => !story.data.draft && story.data.lang === lang)
    .map((story) => ({
      title: story.data.title,
      description: story.data.intro || story.data.description || '',
      body: markdownToSearchText(story.body || ''),
      formats: story.data.formats,
      url: `${pathPrefix}/stories/${getPublicSlug(story.id, story.data.lang)}/`,
    }));
}

export async function createStorySearchResponse(lang: ContentLanguage): Promise<Response> {
  const entries = await getStorySearchIndex(lang);

  return new Response(JSON.stringify(entries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
