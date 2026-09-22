export const SITE_NAME = 'If It All Ends';

type ArticleStructuredDataInput = {
  title: string;
  description: string;
  datePublished: string;
  canonicalURL: string;
  lang: 'en' | 'ko';
  imageURL?: string;
};

export function createWebsiteStructuredData(site: URL) {
  const url = new URL('/', site).toString();

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${url}#website`,
    name: SITE_NAME,
    url,
    inLanguage: ['en', 'ko'],
  };
}

export function createArticleStructuredData({
  title,
  description,
  datePublished,
  canonicalURL,
  lang,
  imageURL,
}: ArticleStructuredDataInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${canonicalURL}#article`,
    headline: title,
    description,
    datePublished,
    inLanguage: lang,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalURL,
    },
    ...(imageURL ? { image: imageURL } : {}),
  };
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
