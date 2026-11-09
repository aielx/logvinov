import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Доступность @a11y", () => {
  test("лендинг без критических нарушений", async ({ page }) => {
    await page.goto("");
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""));
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });

  test("хронология без критических нарушений", async ({ page }) => {
    await page.goto("timeline/");
    await expect(page.locator(".timeline-item").first()).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""));
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });

  test("галерея без критических нарушений", async ({ page }) => {
    await page.goto("gallery/");
    await expect(page.locator(".archive-card").first()).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""));
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });

  test("древо без критических нарушений", async ({ page }) => {
    await page.goto("tree/");
    await expect(page.locator("#family-tree g.person-node").first()).toBeVisible({ timeout: 15_000 });
    // label-content-name-mismatch отключён только здесь: axe склеивает текст
    // соседних SVG <text>/<tspan> без пробелов («ПетровичЛогвинов1890–1955») и
    // ложно сравнивает склейку с aria-label. Доступное имя каждого узла полное
    // (имя, годы, метка приватности, действие), визуальные тексты aria-hidden,
    // работа с клавиатуры проверяется отдельным тестом в tree.spec.ts.
    const results = await new AxeBuilder({ page }).disableRules(["label-content-name-mismatch"]).analyze();
    const critical = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""));
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
