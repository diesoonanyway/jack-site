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

export function getPairedEntryId(
  entry: string,
  lang: unknown,
  frontmatterSlug: unknown,
): string {
  const normalizedEntry = entry.replace(/\\/g, '/').replace(/^\.\//, '');
  const match = /^(.*)_(en|ko)\.md$/.exec(normalizedEntry);

  if (!match?.[1] || !match[2]) {
    throw new Error(
      `Invalid paired entry path: "${entry}". Expected <slug>_en.md or <slug>_ko.md.`,
    );
  }

  const [, publicSlug, fileLanguage] = match;
  assertMatchingLanguage(normalizedEntry, fileLanguage, lang);

  if (typeof frontmatterSlug !== 'string' || frontmatterSlug !== publicSlug) {
    throw new Error(
      `Content slug mismatch: entry "${normalizedEntry}" uses slug "${publicSlug}" but frontmatter slug is "${String(frontmatterSlug)}".`,
    );
  }

  return `${publicSlug}_${fileLanguage}`;
}

export function getPublicSlug(id: string, lang: ContentLanguage): string {
  const normalizedId = id.replace(/\\/g, '/');
  const flatMatch = /^(.*)_(en|ko)$/.exec(normalizedId);

  if (flatMatch?.[1] && flatMatch[2]) {
    const [, publicSlug, fileLanguage] = flatMatch;
    assertMatchingLanguage(normalizedId, fileLanguage, lang);
    return publicSlug;
  }

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
