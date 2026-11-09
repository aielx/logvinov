import { expect, test } from "@playwright/test";

const FAMILY_PASSWORD = "семейный-тест";

test.describe("Хронология", () => {
  test("11 публичных событий; семейное событие скрыто до входа", async ({ page }) => {
    await page.goto("timeline/");
    const items = page.locator(".timeline-item");
    await expect(items).toHaveCount(11, { timeout: 15_000 });
    const text = await page.locator("#timeline-list").innerText();
    expect(text).toContain("Революция и начало новой эпохи");
    expect(text).not.toContain("CANARY");
    expect(text).not.toContain("Рождение Дмитрия Борисовича");
  });

  test("после входа появляется семейное событие с canary-описанием", async ({ page }) => {
    await page.goto("timeline/");
    await expect(page.locator(".timeline-item").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Для семьи — открыть полное древо" }).click();
    await page.locator("#family-password").fill(FAMILY_PASSWORD);
    await page.getByRole("button", { name: "Войти в семейный режим" }).click();
    await expect(page.locator(".timeline-item")).toHaveCount(12, { timeout: 10_000 });
    const text = await page.locator("#timeline-list").innerText();
    expect(text).toContain("CANARY e1978");
    // Выход убирает семейное событие
    await page.getByRole("button", { name: "Выйти из семейного режима" }).click();
    await expect(page.locator(".timeline-item")).toHaveCount(11);
    expect(await page.locator("#timeline-list").innerText()).not.toContain("CANARY");
  });
});

test.describe("Галерея", () => {
  test("8 публичных материалов, фильтры и счётчик", async ({ page }) => {
    await page.goto("gallery/");
    const cards = page.locator(".archive-card");
    await expect(cards).toHaveCount(8, { timeout: 15_000 });
    await expect(page.locator("#gallery-count")).toHaveText("8 материалов");

    await page.getByRole("button", { name: "Документы" }).click();
    await expect(page.locator(".archive-card:not([hidden])")).toHaveCount(3);
    await expect(page.locator("#gallery-count")).toHaveText("3 материала");

    await page.getByRole("button", { name: "Портреты" }).click();
    await expect(page.locator(".archive-card:not([hidden])")).toHaveCount(2);
    await expect(page.locator("#gallery-count")).toHaveText("2 материала");

    await page.getByRole("button", { name: "Все", exact: true }).click();
    await expect(page.locator(".archive-card:not([hidden])")).toHaveCount(8);
  });

  test("лайтбокс: открытие, подпись, закрытие по Escape с возвратом фокуса", async ({ page }) => {
    await page.goto("gallery/");
    await expect(page.locator(".archive-card").first()).toBeVisible({ timeout: 15_000 });
    const trigger = page.locator(".archive-card-button").first();
    await trigger.click();
    const viewer = page.locator("#media-viewer");
    await expect(viewer).toBeVisible();
    await expect(page.locator("#media-viewer-image")).toBeVisible();
    await expect(page.locator("#media-viewer-caption")).toContainText("Семья Логвиновых у дома");
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("семейные материалы после входа: метаданные и закрытый DRIVE-файл", async ({ page }) => {
    await page.goto("gallery/");
    await expect(page.locator(".archive-card").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Для семьи — открыть полное древо" }).first().click();
    await page.locator("#family-password").fill(FAMILY_PASSWORD);
    await page.getByRole("button", { name: "Войти в семейный режим" }).click();
    const familyCard = page.locator(".archive-card[data-family=true]");
    await expect(familyCard).toHaveCount(3, { timeout: 10_000 });
    await expect(page.locator("#gallery-count")).toHaveText("11 материалов");

    // Закрытый Drive-документ отдаётся по mediaId и показывается через Object URL
    await familyCard.filter({ hasText: "закрытого файла Drive" }).locator("button").click();
    await expect(page.locator("#media-viewer")).toBeVisible();
    await expect(page.locator("#media-viewer-image")).toBeVisible({ timeout: 10_000 });
    const src = await page.locator("#media-viewer-image").getAttribute("src");
    expect(src).toContain("blob:");
    const objectUrl = src as string;

    // Выход отзывает Object URL и убирает семейные карточки (просмотрщик закрываем — он поверх тулбара)
    await page.keyboard.press("Escape");
    await expect(page.locator("#media-viewer")).toBeHidden();
    await page.getByRole("button", { name: "Выйти из семейного режима" }).click();
    await expect(page.locator(".archive-card[data-family=true]")).toHaveCount(0);
    const revoked = await page.evaluate(async (blobUrl: string) => {
      try {
        await fetch(blobUrl);
        return false;
      } catch {
        return true;
      }
    }, objectUrl);
    expect(revoked).toBe(true);
  });

  test("пагинация: кнопка «Показать ещё» отсутствует при 8 материалах", async ({ page }) => {
    await page.goto("gallery/");
    await expect(page.locator(".archive-card").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#gallery-more")).toBeHidden();
  });
});
