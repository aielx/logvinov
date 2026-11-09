import { expect, test } from "@playwright/test";

test.describe("Недоступность API не ломает сайт", () => {
  test.use({ });

  test.beforeEach(async ({ context }) => {
    await context.route("**/exec**", (route) => route.abort());
  });

  test("древо показывает ошибку с повтором; меню и ссылки работают", async ({ page }) => {
    await page.goto("tree/");
    await expect(page.locator("#tree-error")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#tree-error-message")).toContainText("недоступен");
    // Навигация продолжает работать (на мобильном ссылки внутри меню)
    const galleryLink = page.getByRole("link", { name: "Галерея" }).first();
    if (!(await galleryLink.isVisible())) {
      await page.locator(".menu-toggle").click();
    }
    await galleryLink.click();
    await expect(page).toHaveURL(/\/gallery\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Семейная галерея" })).toBeVisible();
  });

  test("хронология и галерея показывают состояние ошибки, футер цел", async ({ page }) => {
    await page.goto("timeline/");
    await expect(page.locator('[data-async="error"]', { hasText: "Не удалось загрузить хронологию" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".footer-bottom a").first()).toBeVisible();
    await page.goto("gallery/");
    await expect(page.locator('[data-async="error"]', { hasText: "Не удалось загрузить галерею" })).toBeVisible({ timeout: 15_000 });
    // Лендинг полностью статичен и работает без API
    await page.goto("");
    await expect(page.getByRole("heading", { level: 1, name: "Род Логвиновых" })).toBeVisible();
  });
});
