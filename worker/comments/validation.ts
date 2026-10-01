export const COMMENT_MAX_LENGTH = 2000;

export type CommentTarget = {
  section: 'what-i-feel' | 'what-i-learn';
  slug: string;
  lang: 'en' | 'ko';
};

export function parseCommentTarget(value: {
  section?: unknown;
  slug?: unknown;
  lang?: unknown;
}): CommentTarget | null {
  if (value.section !== 'what-i-feel' && value.section !== 'what-i-learn') return null;
  if (value.lang !== 'en' && value.lang !== 'ko') return null;
  if (
    typeof value.slug !== 'string' ||
    value.slug.length < 1 ||
    value.slug.length > 220 ||
    /[\u0000-\u001f/\\?#]/.test(value.slug)
  ) return null;

  return {
    section: value.section,
    slug: value.slug,
    lang: value.lang,
  };
}

export function normalizeCommentBody(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized || normalized.length > COMMENT_MAX_LENGTH) return null;
  if (/\u0000/.test(normalized)) return null;
  return normalized;
}
