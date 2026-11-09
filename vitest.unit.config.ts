import { defineConfig } from "vitest/config";

// Unit-тесты клиентской логики (даты, граф, store, cleanup, API-клиент).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/front/**/*.test.ts"],
    env: {
      // API-клиент читает URL лениво; тестам достаточно любого валидного адреса.
      PUBLIC_APPS_SCRIPT_URL: "http://127.0.0.1:8787/exec"
    }
  }
});
