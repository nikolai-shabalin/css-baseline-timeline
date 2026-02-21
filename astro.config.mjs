import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://nikolai-shabalin.github.io',
  base: '/css-baseline-timeline',
  output: 'static',
  build: {
    inlineStylesheets: 'always'
  }
});
