import { expect, test } from "@playwright/test";

const FAMILY_PASSWORD = "семейный-тест";

// Даты демо-набора с точным днём: рождение Анны 1921-06-12 (публичное),
// день памяти Ивана Петровича 1955-02-24 (публичное), брак 1946-07-20
// (публичное ручное), рождение Алексея 1975-09-05 (живой — семейное).
// Часы страницы фиксируются page.clock, чтобы тесты не зависели от реальной даты.

test.describe("Карточка «В этот день» на главной", () => {
  test("сегодня — день рождения публичного человека: годы, ссылка в древо, без canary", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 5, 12, 10, 0, 0));
    await page.goto("");
    const card = page.locator("#on-this-day");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator(".on-this-day-eyebrow")).toHaveText("✦ В этот день");
    await expect(card.locator(".on-this-day-date")).toHaveText("12 июня");
    await expect(card.locator(".on-this-day-name")).toContainText("Анна Сергеевна Логвинова");
    await expect(card.locator(".on-this-day-detail")).toContainText("105 лет со дня рождения");
    await expect(card.locator(".on-this-day-avatar")).toBeVisible();
    await expect(card.locator(".on-this-day-name a")).toHaveAttribute("href", /\/tree\/\?person=p_0004$/);
    expect(await card.innerText()).not.toContain("CANARY");
    expect(await card.innerText()).not.toContain("Алексей");
  });

  test("сегодня — день памяти умершего: пометка и годы", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 1, 24, 10, 0, 0));
    await page.goto("");
    const card = page.locator("#on-this-day");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator(".on-this-day-eyebrow")).toHaveText("✦ В этот день");
    await expect(card.locator(".on-this-day-date")).toHaveText("24 февраля");
    await expect(card.locator(".on-this-day-name")).toContainText("Иван Петрович Логвинов");
    await expect(card.locator(".on-this-day-detail")).toHaveText("день памяти — 71 год");
  });

  test("сегодня пусто — ближайшая дата: «Скоро в роду» с событием и остатком дней", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 6, 16, 10, 0, 0));
    await page.goto("");
    const card = page.locator("#on-this-day");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator(".on-this-day-eyebrow")).toHaveText("✦ Скоро в роду");
    await expect(card.locator(".on-this-day-date")).toHaveText("20 июля");
    await expect(card.locator(".on-this-day-name")).toContainText("Брак Ивана и Анны");
    await expect(card.locator(".on-this-day-detail")).toContainText("80 лет с события");
    await expect(card.locator(".on-this-day-detail")).toContainText("через 4 дня");
  });

  test("день рождения живого — только после семейного входа", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 8, 5, 10, 0, 0));
    await page.goto("");
    const card = page.locator("#on-this-day");
    await expect(card).toBeVisible({ timeout: 15_000 });
    // Публично Алексея нет: показывается ближайшая публичная дата
    await expect(card.locator(".on-this-day-eyebrow")).toHaveText("✦ Скоро в роду");
    await expect(card.locator(".on-this-day-date")).toHaveText("24 февраля");
    expect(await card.innerText()).not.toContain("Алексей");

    await page.getByRole("button", { name: "Для семьи — открыть полное древо" }).click();
    await page.locator("#family-password").fill(FAMILY_PASSWORD);
    await page.getByRole("button", { name: "Войти в семейный режим" }).click();
    await expect(card.locator(".on-this-day-eyebrow")).toHaveText("✦ В этот день", { timeout: 10_000 });
    await expect(card.locator(".on-this-day-date")).toHaveText("5 сентября");
    await expect(card.locator(".on-this-day-name")).toContainText("Алексей Сергеевич Логвинов");
    await expect(card.locator(".on-this-day-detail")).toContainText("исполняется 51 год");
    await expect(card.locator(".on-this-day-badge")).toHaveText("Семейное");

    // Выход возвращает публичную карточку
    await page.getByRole("button", { name: "Выйти из семейного режима" }).click();
    await expect(card.locator(".on-this-day-eyebrow")).toHaveText("✦ Скоро в роду", { timeout: 10_000 });
    await expect(card.locator(".on-this-day-date")).toHaveText("24 февраля");
    expect(await card.innerText()).not.toContain("Алексей");
  });

  test("ближайшая дата: выводятся все её события, но не следующие даты", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 6, 16, 10, 0, 0));
    await page.route(/\/exec\?action=public\.timeline$/, async (route) => {
      const response = await route.fetch();
      const envelope = await response.json();
      envelope.data.events.push(
        {
          eventId: "e2e-same-day-birth",
          eventType: "FAMILY",
          kind: "BIRTH",
          title: "Екатерина Андреевна Логвинова",
          date: "1920-07-20",
          sortKey: 19200720,
          description: "",
          primaryPersonId: null,
          dayKey: "07-20"
        },
        {
          eventId: "e2e-next-day-birth",
          eventType: "FAMILY",
          kind: "BIRTH",
          title: "Событие следующего дня",
          date: "1920-07-21",
          sortKey: 19200721,
          description: "",
          primaryPersonId: null,
          dayKey: "07-21"
        }
      );
      await route.fulfill({ response, json: envelope });
    });
    await page.goto("");
    const card = page.locator("#on-this-day");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator(".on-this-day-date")).toHaveText("20 июля");
    await expect(card.locator(".on-this-day-item")).toHaveCount(2);
    await expect(card.locator(".on-this-day-list")).toContainText("Екатерина Андреевна Логвинова");
    await expect(card.locator(".on-this-day-list")).toContainText("Брак Ивана и Анны");
    expect(await card.innerText()).not.toContain("Событие следующего дня");
  });

  test("восстановление сессии: семейная дата не исчезает при поздней публичной ленте", async ({ page, request }) => {
    const loginResponse = await request.post("http://127.0.0.1:8787/exec", {
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      data: new URLSearchParams({ action: "auth.login", password: FAMILY_PASSWORD }).toString()
    });
    expect(loginResponse.ok()).toBe(true);
    const loginEnvelope = await loginResponse.json();
    await page.addInitScript((token) => window.localStorage.setItem("familyArchive.token", token), loginEnvelope.data.token as string);
    await page.clock.setFixedTime(new Date(2026, 8, 5, 10, 0, 0));
    await page.route(/\/exec\?action=public\.timeline$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    const publicTimelineResponse = page.waitForResponse(/\/exec\?action=public\.timeline$/);
    await page.goto("");
    await (await publicTimelineResponse).finished();
    await expect(page.locator("#hero-meta")).toBeVisible();

    const card = page.locator("#on-this-day");
    await expect(card.locator(".on-this-day-eyebrow")).toHaveText("✦ В этот день");
    await expect(card.locator(".on-this-day-date")).toHaveText("5 сентября");
    await expect(card.locator(".on-this-day-name")).toContainText("Алексей Сергеевич Логвинов");
    await expect(card.locator(".on-this-day-badge")).toHaveText("Семейное");
  });
});
