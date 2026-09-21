export type ContentLanguage = 'en' | 'ko';

const contentLanguages = new Set<ContentLanguage>(['en', 'ko']);

function assertMatchingLanguage(
  id: string,
  fileLanguage: string,
  frontmatterLanguage: unknown,
): asserts frontmatterLanguage is ContentLanguage {
  if (!contentLanguages.has(frontmatterLanguage as ContentLanguage)) {
    throw new Error(
      `Content language mismatch: entry "${id}" uses the "${fileLanguage}" filename suffix but frontmatter lang is "${String(frontmatterLanguage)}".`,
    );
  }

  if (fileLanguage !== frontmatterLanguage) {
    throw new Error(
      `Content language mismatch: entry "${id}" uses the "${fileLanguage}" filename suffix but frontmatter lang is "${frontmatterLanguage}".`,
    );
  }
}

export function getPairedEntryId(entry: string, lang: unknown): string {
  const normalizedEntry = entry.replace(/\\/g, '/');
  const match = /^(.*)\/index_(en|ko)\.md$/.exec(normalizedEntry);

  if (!match?.[1] || !match[2]) {
    throw new Error(
      `Invalid paired entry path: "${entry}". Expected <slug>/index_en.md or <slug>/index_ko.md.`,
    );
  }

  const [, publicSlug, fileLanguage] = match;
  assertMatchingLanguage(normalizedEntry, fileLanguage, lang);

  return `${publicSlug}/index_${fileLanguage}`;
}

export function getPublicSlug(id: string, lang: ContentLanguage): string {
  const normalizedId = id.replace(/\\/g, '/');
  const pairedMatch = /^(.*)\/index_(en|ko)$/.exec(normalizedId);

  if (pairedMatch?.[1] && pairedMatch[2]) {
    const [, publicSlug, fileLanguage] = pairedMatch;
    assertMatchingLanguage(normalizedId, fileLanguage, lang);
    return publicSlug;
  }

  const [firstSegment, ...remainingSegments] = normalizedId.split('/');

  if (!contentLanguages.has(firstSegment as ContentLanguage)) {
    return normalizedId;
  }

  if (firstSegment !== lang) {
    throw new Error(
      `Content language mismatch: entry "${normalizedId}" uses the "${firstSegment}" prefix but frontmatter lang is "${lang}".`,
    );
  }

  const publicSlug = remainingSegments.join('/');

  if (!publicSlug) {
    throw new Error(
      `Content entry "${normalizedId}" has a language prefix but no public slug.`,
    );
  }

  return publicSlug;
}
