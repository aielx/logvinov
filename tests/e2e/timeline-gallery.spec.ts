import { expect, test } from "@playwright/test";

const FAMILY_PASSWORD = "семейный-тест";

test.describe("Хронология", () => {
  test("публичная лента: карточки и компактные строки рождений/смертей", async ({ page }) => {
    await page.goto("timeline/");
    const items = page.locator(".timeline-item");
    await expect(items).toHaveCount(20, { timeout: 15_000 });
    // 14 автострок (рождения и смерти публичных людей) + 6 ручных карточек
    await expect(page.locator(".timeline-item.is-vital")).toHaveCount(14);
    const text = await page.locator("#timeline-list").innerText();
    expect(text).toContain("Революция и начало новой эпохи");
    expect(text).toContain("Анна Сергеевна Логвинова");
    const birth = page.locator('.timeline-item.is-vital time[datetime="1921-06-12"]');
    await expect(birth).toHaveText("День рождения · 12 июня 1921 г.");
    const death = page.locator('.timeline-item.is-vital time[datetime="1955-02-24"]');
    await expect(death).toHaveText("День памяти · 24 февраля 1955 г.");
    expect(text).not.toContain("CANARY");
    // Живые и люди с карточкой «Семейная» не получают публичных автострок
    await expect(page.locator('.is-vital a[href*="p_0006"]')).toHaveCount(0);
    await expect(page.locator('.is-vital a[href*="p_0008"]')).toHaveCount(0);
    await expect(page.locator('.is-vital a[href*="p_0010"]')).toHaveCount(0);
  });

  test("фильтры: семейные даты и исторический контекст переключаются независимо", async ({ page }) => {
    await page.goto("timeline/");
    await expect(page.locator(".timeline-item").first()).toBeVisible({ timeout: 15_000 });
    const historyChip = page.locator("[data-timeline-filter='history']");
    const familyChip = page.locator("[data-timeline-filter='family']");
    await expect(historyChip).toHaveAttribute("aria-pressed", "true");
    await historyChip.click();
    await expect(historyChip).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".timeline-item")).toHaveCount(18);
    await expect(page.locator(".timeline-item.is-history")).toHaveCount(0);
    await familyChip.click();
    await expect(page.locator(".timeline-item")).toHaveCount(0);
    await expect(page.locator(".timeline-filter-empty")).toBeVisible();
    await historyChip.click();
    await expect(page.locator(".timeline-item")).toHaveCount(2);
  });

  test("компактная строка ведёт на карточку человека в древе", async ({ page }) => {
    await page.goto("timeline/");
    const anna = page.locator(".is-vital .vital-names a", { hasText: "Анна Сергеевна Логвинова" }).first();
    await expect(anna).toBeVisible({ timeout: 15_000 });
    await anna.click();
    await expect(page).toHaveURL(/\/tree\/\?person=p_0004$/);
    await expect(page.locator("#person-dialog")).toBeVisible();
    await expect(page.locator("#person-content")).toContainText("Анна Сергеевна Логвинова", { timeout: 10_000 });
  });

  test("после входа появляются семейные автособытия и canary-строка", async ({ page }) => {
    await page.goto("timeline/");
    await expect(page.locator(".timeline-item").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Для семьи — открыть полное древо" }).click();
    await page.locator("#family-password").fill(FAMILY_PASSWORD);
    await page.getByRole("button", { name: "Войти в семейный режим" }).click();
    // 20 публичных + canary-карточка + рождение/смерть Екатерины + рождение Алексея
    await expect(page.locator(".timeline-item")).toHaveCount(24, { timeout: 10_000 });
    const text = await page.locator("#timeline-list").innerText();
    expect(text).toContain("CANARY e1978");
    expect(text).toContain("Екатерина Андреевна Логвинова");
    // Выход убирает семейные события и автостроки
    await page.getByRole("button", { name: "Выйти из семейного режима" }).click();
    await expect(page.locator(".timeline-item")).toHaveCount(20);
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

  test("лайтбокс: зум кнопками, колесом, двойным кликом и клавиатурой", async ({ page }) => {
    test.skip(test.info().project.name === "mobile-touch", "двойной клик мышью проверяем в десктоп-проектах");
    await page.goto("gallery/");
    await expect(page.locator(".archive-card").first()).toBeVisible({ timeout: 15_000 });
    await page.locator(".archive-card-button").first().click();
    const image = page.locator("#media-viewer-image");
    await expect(image).toBeVisible();
    const level = page.locator("#media-zoom-level");

    // Кнопки: 100% → 125% → 100%, курсор меняется на «grab»
    await expect(level).toHaveText("100%");
    await page.getByRole("button", { name: "Увеличить изображение" }).click();
    await expect(level).toHaveText("125%");
    await expect(image).toHaveCSS("cursor", "grab");
    await page.getByRole("button", { name: "Уменьшить изображение" }).click();
    await expect(level).toHaveText("100%");
    await expect(image).toHaveCSS("cursor", "zoom-in");

    // Колесо мыши: прокрутка вверх увеличивает, вниз возвращает
    const box = await image.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -200);
      await expect(level).toHaveText("135%");
      await page.mouse.wheel(0, 200);
      await expect(level).toHaveText("100%");
    }

    // Двойной клик: 100% → 250%, повторный — сброс
    await image.dblclick();
    await expect(level).toHaveText("250%");
    await image.dblclick();
    await expect(level).toHaveText("100%");

    // Клавиатура: «+» увеличивает, «0» сбрасывает
    await page.keyboard.press("+");
    await expect(level).toHaveText("125%");
    await page.keyboard.press("0");
    await expect(level).toHaveText("100%");

    // Сброс после закрытия/переоткрытия
    await page.keyboard.press("+");
    await expect(level).toHaveText("125%");
    await page.keyboard.press("Escape");
    await expect(page.locator("#media-viewer")).toBeHidden();
    await page.locator(".archive-card-button").first().click();
    await expect(image).toBeVisible();
    await expect(level).toHaveText("100%");
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
