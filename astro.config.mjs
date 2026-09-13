import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ifitallends.com',

  redirects: {
    '/writing': '/journal',
    '/writing/[id]': '/journal/[id]',
    '/ko/writing': '/ko/journal',
    '/ko/writing/[id]': '/ko/journal/[id]',
  },

  integrations: [
    sitemap(),
  ],
});
