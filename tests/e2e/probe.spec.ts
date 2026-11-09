import { test } from "@playwright/test";
test("probe 404 relative", async ({ page }) => {
  await page.goto("");
  await page.goto("tree/");
  console.log("URL before:", page.url());
  await page.goto("no-such-page/");
  console.log("URL after:", page.url());
  console.log("STATUS heading count:", await page.getByRole("heading", { level: 1 }).count());
  console.log("BODY:", (await page.locator("h1").allTextContents()).join("|"));
});
