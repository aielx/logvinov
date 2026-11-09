import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

const PORT_SITE = 4321;
const PORT_API = 8787;

// WebKit требует системные библиотеки (libsoup, libavif, libjxl, …), которые
// нельзя поставить без sudo. В CI их ставит `npx playwright install --with-deps`.
// Локально webkit автоматически пропускается, если библиотек нет.
let webkitEnabled = true;
if (!process.env.CI) {
  try {
    execSync("ldconfig -p | grep -q 'libsoup-3.0.so'", { stdio: "pipe", shell: "/bin/bash" });
  } catch {
    webkitEnabled = false;
    console.warn("[playwright] webkit пропущен локально: нет системных библиотек (sudo npx playwright install-deps webkit).");
  }
}

// E2E против локального contract-mock API (tests/fixtures/mock-api),
// воспроизводящего контракт Apps Script без обращения к Google.
// Реальные CORS-проверки живого Apps Script — tests/e2e/staging.playwright.config.ts.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  testIgnore: /api-cors\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],
  use: {
    // Хвостовой слэш обязателен: относительные goto("tree/") должны сохранять /logvinov/.
    baseURL: `http://127.0.0.1:${PORT_SITE}/logvinov/`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    ...(webkitEnabled ? [{ name: "webkit", use: { ...devices["Desktop Safari"] } }] : []),
    { name: "mobile-touch", use: { ...devices["Pixel 7"] } }
  ],
  webServer: [
    {
      command: `node tests/fixtures/mock-api/server.mjs ${PORT_API}`,
      port: PORT_API,
      reuseExistingServer: !process.env.CI
    },
    {
      command: `npm run preview -- --port ${PORT_SITE} --host 127.0.0.1`,
      port: PORT_SITE,
      reuseExistingServer: !process.env.CI
    }
  ]
});
