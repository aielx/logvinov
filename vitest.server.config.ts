import { defineConfig } from "vitest/config";

// Серверные unit/интеграционные тесты логики Apps Script.
// Глобальные сервисы (PropertiesService и др.) подменяются в setup-файле.
export default defineConfig({
  test: {
    environment: "node",
    include: ["apps-script/tests/**/*.test.ts", "tests/unit/server/**/*.test.ts"],
    setupFiles: ["apps-script/tests/globals-mock.ts"]
  }
});
