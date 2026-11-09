import { defineConfig } from "@playwright/test";

// Конфигурация staging-проверок живого Apps Script (tests/e2e/api-cors.spec.ts).
// Требует API_STAGING_URL и E2E_FAMILY_PASSWORD; без них тесты пропускаются.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /api-cors\.spec\.ts/,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    trace: "off"
  }
});
