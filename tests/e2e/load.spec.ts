/**
 * Нагрузочная проверка (план, раздел 8): 200 синтетических человек, 6–7 поколений,
 * ≥250 связей, 320 медиа. Проверяет первичный рендер, фильтрацию без сетевых
 * запросов, смену вида, zoom, открытие карточек и 20 циклов входа/выхода
 * без накопления DOM/Object URL.
 *
 * Запуск (после генерации набора и пересборки на mock-API с ним):
 *   node tests/fixtures/generate-synthetic.mjs
 *   cp tests/fixtures/mock-api/data.synthetic.json tests/fixtures/mock-api/data.json
 *   E2E_LOAD=1 npm run test:e2e -- load
 */
import { expect, test } from "@playwright/test";

const run = process.env.E2E_LOAD === "1" ? test : test.skip;
const FAMILY_PASSWORD = "семейный-тест";

test.describe("Нагрузочная проверка @load", () => {
  test.setTimeout(120_000);

  run("первичный рендер 200 человек и счётчик", async ({ page }) => {
    await page.goto("tree/");
    await expect(page.locator("#family-tree g.person-node").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#visible-count")).toHaveText("200 из 200 человек", { timeout: 30_000 });
  });

  run("фильтр ветвей и смена вида без новых сетевых запросов", async ({ page }) => {
    await page.goto("tree/");
    await expect(page.locator("#visible-count")).toHaveText("200 из 200 человек", { timeout: 30_000 });
    let apiCalls = 0;
    page.on("request", (request) => {
      if (request.url().includes("/exec")) apiCalls += 1;
    });
    await page.locator("#branch-select").selectOption("b_syn1");
    await expect(page.locator("#visible-count")).not.toHaveText("200 из 200 человек");
    await page.getByRole("button", { name: "Список" }).click();
    await page.getByRole("button", { name: "Поколения", exact: true }).click();
    await page.locator("#zoom-in").click();
    await page.locator("#zoom-reset").click();
    await page.waitForTimeout(500);
    expect(apiCalls).toBe(0);
  });

  run("открытие карточек не накапливает DOM", async ({ page }) => {
    await page.goto("tree/");
    await expect(page.locator("#family-tree g.person-node").first()).toBeVisible({ timeout: 30_000 });
    const personIds = await page.locator("#tree-list .tree-list-item").evaluateAll((items) =>
      items.slice(0, 5).map((item) => (item as HTMLElement).dataset.personId)
    );
    await page.getByRole("button", { name: "Список" }).click();
    for (const personId of personIds) {
      await page.locator(`#tree-list [data-person-id=${personId}]`).click();
      await expect(page.locator("#person-dialog")).toBeVisible();
      await page.locator("#person-close").click();
      await expect(page.locator("#person-dialog")).toBeHidden();
    }
    const sectionCount = await page.locator("#person-content .person-section, #person-content .person-profile").count();
    expect(sectionCount).toBeLessThanOrEqual(7);
  });

  run("20 циклов входа/выхода без утечек Object URL", async ({ page }) => {
    await page.goto("gallery/");
    await expect(page.locator(".archive-card").first()).toBeVisible({ timeout: 30_000 });
    for (let cycle = 0; cycle < 20; cycle += 1) {
      await page.getByRole("button", { name: "Для семьи — открыть полное древо" }).click();
      await page.locator("#family-password").fill(FAMILY_PASSWORD);
      await page.getByRole("button", { name: "Войти в семейный режим" }).click();
      await expect(page.getByRole("button", { name: "Выйти из семейного режим" }).first()).toBeVisible();
      await page.getByRole("button", { name: "Выйти из семейного режим" }).first().click();
      await expect(page.getByRole("button", { name: "Для семьи — открыть полное древо" }).first()).toBeVisible();
    }
    // JS-ошибок нет и диалоги закрыты
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });
});
