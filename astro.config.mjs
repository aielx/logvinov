import { defineConfig } from "astro/config";

// https://docs.astro.build/en/guides/deploy/github/
// Публикация: https://aielx.github.io/logvinov/
export default defineConfig({
  site: "https://aielx.github.io",
  base: "/logvinov",
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
