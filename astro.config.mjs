import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ifitallends.com',

  integrations: [
    sitemap({
      filter: (page) => ![
        'https://ifitallends.com/apps/',
        'https://ifitallends.com/ko/apps/',
      ].includes(page),
    }),
  ],
});
