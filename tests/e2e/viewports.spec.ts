import { expect, test } from "@playwright/test";

const PAGES = ["", "tree/", "timeline/", "gallery/"];

test.describe("Адаптивность без горизонтального переполнения", () => {
  // Матрица 4×4 на проект: холодный старт браузера под параллельной нагрузкой
  // может превышать дефолтные 30 с — даём запас.
  test.setTimeout(60_000);
  for (const width of [1920, 1366, 768, 375]) {
    for (const path of PAGES) {
      test(`${width}px ${path}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 500 ? 800 : 900 });
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth - document.documentElement.clientWidth;
        });
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});
