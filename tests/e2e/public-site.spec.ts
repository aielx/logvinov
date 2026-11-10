import { expect, test } from "@playwright/test";

test.describe("Публичный сайт", () => {
  test("лендинг: живые превью из API и контакты разработчика", async ({ page }) => {
    await page.goto("");
    await expect(page.getByRole("heading", { level: 1, name: "Род Логвиновых" })).toBeVisible();

    // Счётчики hero и схема поколений — из public.tree, не из зашитого демо
    await expect(page.locator("#hero-eyebrow")).toHaveText("Семейный архив · 4 поколения", { timeout: 15_000 });
    await expect(page.locator("#hero-meta")).toHaveText("10 человек4 поколения11 событий");
    await expect(page.locator("#tree .preview-person").first()).toContainText("Иван Петрович");
    await expect(page.locator("#tree .preview-label").first()).toHaveText("I поколение");

    // Хронология: первое и среднее событие из public.timeline
    await expect(page.locator("#timeline .timeline-preview h3").first()).toContainText("Рождение Ивана Петровича");
    await expect(page.locator("#timeline .timeline-preview time").nth(1)).toHaveText("1941–1945");

    // Галерея: первые материалы из public.gallery с реальными подписями
    await expect(page.locator("#gallery .gallery-preview figure")).toHaveCount(3, { timeout: 15_000 });
    await expect(page.locator("#gallery .gallery-preview figcaption").first()).toContainText("Семья Логвиновых у дома");

    await expect(page.getByRole("link", { name: /logvinovaleksander@gmail\.com/ }).first()).toBeVisible();
    await expect(page.getByText("Александр Сергеевич Логвинов")).toBeVisible();
  });

  test("навигация между четырьмя страницами и 404", async ({ page }) => {
    await page.goto("");
    await page.getByRole("link", { name: "Хронология" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Хронология рода" })).toBeVisible();
    await page.getByRole("link", { name: "Галерея" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Семейная галерея" })).toBeVisible();
    await page.getByRole("link", { name: "Древо", exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Семейное древо" })).toBeVisible();
    await page.goto("no-such-page/");
    await expect(page.getByRole("heading", { level: 1, name: "Страница не найдена" })).toBeVisible();
  });

  test("мобильное меню открывается и закрывается", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("");
    const menuButton = page.locator(".menu-toggle");
    await menuButton.click();
    await expect(page.locator("#site-nav")).toHaveClass(/is-open/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#site-nav")).not.toHaveClass(/is-open/);
  });
});
