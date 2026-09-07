import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://jack-site.korean-app-dev.workers.dev',

  integrations: [
    sitemap(),
  ],
});