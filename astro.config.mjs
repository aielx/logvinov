import { defineConfig } from "astro/config";

// https://docs.astro.build/en/guides/deploy/github/
// Публикация: https://logvinov-tree.ru/ (GitHub Pages, кастомный домен)
export default defineConfig({
  site: "https://logvinov-tree.ru",
  output: "static",
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
