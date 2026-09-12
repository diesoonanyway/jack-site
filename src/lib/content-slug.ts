export type ContentLanguage = 'en' | 'ko';

const contentLanguages = new Set<ContentLanguage>(['en', 'ko']);

export function getPublicSlug(id: string, lang: ContentLanguage): string {
  const [firstSegment, ...remainingSegments] = id.split('/');

  if (!contentLanguages.has(firstSegment as ContentLanguage)) {
    return id;
  }

  if (firstSegment !== lang) {
    throw new Error(
      `Content language mismatch: entry "${id}" uses the "${firstSegment}" prefix but frontmatter lang is "${lang}".`,
    );
  }

  const publicSlug = remainingSegments.join('/');

  if (!publicSlug) {
    throw new Error(
      `Content entry "${id}" has a language prefix but no public slug.`,
    );
  }

  return publicSlug;
}
