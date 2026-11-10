import { expect, test, type Page } from "@playwright/test";

const FAMILY_PASSWORD = "семейный-тест";

/** Клик по SVG-узлу: обычный на десктопе, DOM-событие на тач-мобильном
 * (геометрический клик перехватывается футером при узких экранах). */
async function clickTreeNode(page: Page, personId: string): Promise<void> {
  const node = page.locator(`#family-tree [data-person-id=${personId}]`);
  if (test.info().project.name === "mobile-touch") {
    await node.dispatchEvent("click");
  } else {
    await node.click();
  }
}

test.describe("Семейное древо", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("tree/");
    await expect(page.locator("#family-tree g.person-node").first()).toBeVisible({ timeout: 15_000 });
  });

  test("все 10 человек в SVG-древе: имена, годы, метки приватности", async ({ page }) => {
    const nodes = page.locator("#family-tree g.person-node");
    await expect(nodes).toHaveCount(10);
    await expect(page.locator("#family-tree [data-person-id=p_0001] .node-name")).toContainText("Иван Петрович");
    await expect(page.locator("#family-tree [data-person-id=p_0001] .node-years")).toHaveText("1890–1955");
    await expect(page.locator("#family-tree [data-person-id=p_0008] .node-private")).toHaveText("ДЕТАЛИ ПО ПАРОЛЮ");
    await expect(page.locator("#visible-count")).toHaveText("10 из 10 человек");
  });

  test("счётчик и связи: браки пунктиром, дети от обоих родителей", async ({ page }) => {
    await expect(page.locator("#family-tree path.marriage-link")).toHaveCount(3);
    await expect(page.locator("#family-tree path.family-link").first()).toBeVisible();
  });

  test("вид «Список»: поколения и открытие карточки из списка", async ({ page }) => {
    await page.getByRole("button", { name: "Список" }).click();
    await expect(page.locator("#tree-list")).toBeVisible();
    await expect(page.locator("#family-tree")).toBeHidden();
    const items = page.locator("#tree-list .tree-list-item");
    await expect(items).toHaveCount(10);
    await items.filter({ hasText: "Сергей Иванович" }).first().click();
    await expect(page.locator("#person-dialog")).toBeVisible();
    await expect(page.locator("#person-name")).toHaveText("Сергей Иванович Логвинов");
  });

  test("фильтр ветвей сохраняет общих предков", async ({ page }) => {
    // Все ветви из данных видны в списке, включая ветвь общих предков.
    const options = page.locator("#branch-select option");
    await expect(options).toHaveCount(4); // «Все ветви» + 3 ветви
    await expect(options.filter({ hasText: "Общие предки" })).toHaveCount(1);
    await page.locator("#branch-select").selectOption({ label: "Ветвь Ивана" });
    await expect(page.locator("#family-tree g.person-node")).toHaveCount(6);
    await expect(page.locator("#visible-count")).toHaveText("6 из 10 человек");
    await page.locator("#branch-select").selectOption({ label: "Ветвь Петра" });
    await expect(page.locator("#family-tree g.person-node")).toHaveCount(6);
    await page.locator("#branch-select").selectOption("all");
    await expect(page.locator("#family-tree g.person-node")).toHaveCount(10);
  });

  test("zoom кнопками и сброс", async ({ page }) => {
    const transformBefore = await page.locator("#family-tree .tree-viewport").getAttribute("transform");
    await page.locator("#zoom-in").click();
    await page.waitForTimeout(350);
    const transformAfter = await page.locator("#family-tree .tree-viewport").getAttribute("transform");
    expect(transformAfter).not.toBe(transformBefore);
    await page.locator("#zoom-reset").click();
    await page.waitForTimeout(400);
    const transformReset = await page.locator("#family-tree .tree-viewport").getAttribute("transform");
    expect(transformReset).not.toBe(transformAfter);
  });

  test("карточка умершего публична: биография, родители, материалы", async ({ page }) => {
    await clickTreeNode(page, "p_0001");
    const dialog = page.locator("#person-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#person-name")).toHaveText("Иван Петрович Логвинов");
    await expect(page.locator(".person-years").first()).toHaveText("1890–1955");
    await expect(page.locator(".person-status").first()).toContainText("общедоступная карточка");
    await expect(page.locator(".person-biography")).toContainText("Крестьянин");
    await expect(page.locator(".relation-button").filter({ hasText: "Мария Ивановна" })).toBeVisible();
    // Переход по родственнику: супруга
    await page.locator(".relation-button").filter({ hasText: "Мария Ивановна" }).click();
    await expect(page.locator("#person-name")).toHaveText("Мария Ивановна Логвинова");
  });

  test("семейные карточки: живой открывает вход, неверный пароль не меняет состояние", async ({ page }) => {
    await clickTreeNode(page, "p_0008");
    await expect(page.locator("#login-modal")).toBeVisible();
    await page.locator("#family-password").fill("неверный-пароль");
    await page.getByRole("button", { name: "Войти в семейный режим" }).click();
    await expect(page.locator("#password-error")).toBeVisible();
    await expect(page.locator("#login-modal")).toBeVisible();
    await expect(page.locator("#person-dialog")).toBeHidden();
  });

  test("после входа открывается исходная карточка живого и семейные данные", async ({ page }) => {
    await clickTreeNode(page, "p_0008");
    await expect(page.locator("#login-modal")).toBeVisible();
    await page.locator("#family-password").fill(FAMILY_PASSWORD);
    await page.getByRole("button", { name: "Войти в семейный режим" }).click();
    await expect(page.locator("#login-modal")).toBeHidden();
    // pending-карточка открывается автоматически
    await expect(page.locator("#person-dialog")).toBeVisible();
    await expect(page.locator("#person-name")).toHaveText("Алексей Сергеевич Логвинов");
    await expect(page.locator("#person-content")).toContainText("CANARY p0008");
    await expect(page.locator("#family-tree [data-person-id=p_0008] .node-private")).toHaveText("СЕМЕЙНАЯ КАРТОЧКА");
    await expect(page.locator("[data-private-status]").first()).toHaveText("Семейный режим");
  });

  test("семейные материалы в карточке: миниатюра DRIVE-фото и видимое название", async ({ page }) => {
    await clickTreeNode(page, "p_0008");
    await expect(page.locator("#login-modal")).toBeVisible();
    await page.locator("#family-password").fill(FAMILY_PASSWORD);
    await page.getByRole("button", { name: "Войти в семейный режим" }).click();
    await expect(page.locator("#person-name")).toHaveText("Алексей Сергеевич Логвинов", { timeout: 10_000 });

    // Два семейных материала: закрытый DRIVE-файл и фото-ссылка Drive
    const grid = page.locator(".person-gallery");
    await expect(grid.locator("button")).toHaveCount(2);
    await expect(
      grid.getByRole("button", { name: "Открыть семейный материал: Семейный документ (демонстрация закрытого файла Drive)" })
    ).toBeAttached();

    // Закрытый DRIVE-фото: миниатюра подтягивается через private.media как Object URL
    await expect(grid.locator("img[src^='blob:']")).toBeVisible({ timeout: 10_000 });

    // Недоступная внешняя картинка сменяется заглушкой с реальным названием
    await expect(grid.locator(".material-placeholder-title").filter({ hasText: "Семейное фото-ссылка Drive" })).toBeVisible({ timeout: 10_000 });
  });

  test("logout закрывает семейную карточку и возвращает публичное древо", async ({ page }) => {
    // вход
    await page.getByRole("button", { name: "Семейный доступ" }).click();
    await page.locator("#family-password").fill(FAMILY_PASSWORD);
    await page.getByRole("button", { name: "Войти в семейный режим" }).click();
    await expect(page.locator("[data-private-status]").first()).toHaveText("Семейный режим");
    // семейная карточка открыта
    await clickTreeNode(page, "p_0010");
    await expect(page.locator("#person-content")).toContainText("CANARY p0010");
    // выход: сначала закрываем карточку (диалог перекрывает тулбар)
    await page.locator("#person-close").click();
    await expect(page.locator("#person-dialog")).toBeHidden();
    await page.getByRole("button", { name: "Завершить семейный режим" }).click();
    await expect(page.locator("[data-private-status]").first()).toHaveText("Публичная версия");
    await expect(page.locator("#person-dialog")).toBeHidden();
    // Токен удалён, CANARY-строк в DOM нет
    const token = await page.evaluate(() => window.localStorage.getItem("familyArchive.token"));
    expect(token).toBeNull();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("CANARY");
  });

  test("сессия сохраняется после перезагрузки страницы", async ({ page }) => {
    await page.getByRole("button", { name: "Семейный доступ" }).click();
    await page.locator("#family-password").fill(FAMILY_PASSWORD);
    await page.getByRole("button", { name: "Войти в семейный режим" }).click();
    await expect(page.locator("[data-private-status]").first()).toHaveText("Семейный режим");
    await page.reload();
    await expect(page.locator("#family-tree g.person-node").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-private-status]").first()).toHaveText("Семейный режим", { timeout: 10_000 });
  });

  test("клавиатура: Enter открывает карточку, Escape закрывает", async ({ page }) => {
    await page.locator("#family-tree g.person-node").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#person-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#person-dialog")).toBeHidden();
  });
});
