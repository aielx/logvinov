/**
 * Staging-проверка реального Apps Script Web App (этап 1 плана):
 * запросы именно с реального origin, чтение JSON без no-cors, пароль/токен вне URL.
 *
 * Запуск (вручную, после развёртывания Apps Script):
 *   API_STAGING_URL=https://script.google.com/macros/s/<ID>/exec \
 *   E2E_FAMILY_PASSWORD='...' \
 *   npm run test:e2e:staging
 * Без переменных тесты пропускаются.
 */
import { expect, test } from "@playwright/test";

const API_URL = process.env.API_STAGING_URL ?? "";
const FAMILY_PASSWORD = process.env.E2E_FAMILY_PASSWORD ?? "";

// Без env-переменных весь блок пропускается (staging-проверка ручная).
const testFn = (API_URL && FAMILY_PASSWORD ? test : test.skip) as typeof test;

testFn.describe("Apps Script CORS и контракт (staging)", () => {
  testFn("health отвечает JSON-конвертом", async ({ request }) => {
    const response = await request.get(`${API_URL}?action=health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.apiVersion).toBe("1");
  });

  testFn("public.tree читается без no-cors и без кастомных заголовков", async ({ request }) => {
    const response = await request.get(`${API_URL}?action=public.tree`);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.people.length).toBeGreaterThan(0);
  });

  testFn("вход POST urlencoded, токен не в URL", async ({ request }) => {
    const response = await request.post(API_URL, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      form: { action: "auth.login", password: FAMILY_PASSWORD }
    });
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.token.length).toBeGreaterThanOrEqual(64);
    expect(response.url()).not.toContain("token=");

    // Приватный запрос с токеном в теле
    const privateResponse = await request.post(API_URL, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      form: { action: "private.gallery", token: body.data.token }
    });
    const privateBody = await privateResponse.json();
    expect(privateBody.ok).toBe(true);

    // Logout и повторный приватный запрос → 401
    await request.post(API_URL, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      form: { action: "auth.logout", token: body.data.token }
    });
    const afterLogout = await request.post(API_URL, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      form: { action: "private.gallery", token: body.data.token }
    });
    const afterLogoutBody = await afterLogout.json();
    expect(afterLogoutBody.ok).toBe(false);
    expect(afterLogoutBody.error.status).toBe(401);
  });

  testFn("неверный пароль → 401 прикладной код", async ({ request }) => {
    const response = await request.post(API_URL, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      form: { action: "auth.login", password: "точно-не-семейный-пароль" }
    });
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.status).toBe(401);
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });
});
