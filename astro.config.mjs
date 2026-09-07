import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [
    sitemap(),
  ],

  /*
    실제 도메인은 배포 후 여기에 넣는다.

    예:
    site: 'https://your-domain.com'
  */
});