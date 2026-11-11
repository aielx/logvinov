import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// https://docs.astro.build/en/guides/deploy/github/
// Публикация: https://logvinov-tree.ru/ (GitHub Pages, кастомный домен)
export default defineConfig({
  site: "https://logvinov-tree.ru",
  output: "static",
  integrations: [
    // sitemap-index.xml + sitemap-0.xml в dist, ссылка из public/robots.txt
    sitemap()
  ],
  build: {
    inlineStylesheets: "auto"
  },
  vite: {
    build: {
      // Source maps не публикуются: приватных строк в dist быть не должно.
      sourcemap: false
    }
  }
});
