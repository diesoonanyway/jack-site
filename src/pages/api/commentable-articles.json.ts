import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPublicSlug } from '../../lib/content-slug';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [whatIFeel, whatILearn] = await Promise.all([
    getCollection('stories'),
    getCollection('whatILearn'),
  ]);

  const keys = [
    ...whatIFeel
      .filter((entry) => !entry.data.draft)
      .map((entry) => `what-i-feel:${getPublicSlug(entry.id, entry.data.lang)}:${entry.data.lang}`),
    ...whatILearn
      .filter((entry) => !entry.data.draft)
      .map((entry) => `what-i-learn:${getPublicSlug(entry.id, entry.data.lang)}:${entry.data.lang}`),
  ].sort();

  return new Response(JSON.stringify({ keys }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
