import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";

const server = createServer((req, res) => {
  let path = req.url.split("?")[0];
  let file = `./dist${path}`;
  if (existsSync(file) && statSync(file).isDirectory()) file = `${file}/index.html`;
  else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html" : "application/octet-stream" });
  res.end(readFileSync(file));
});
server.listen(8788);
const base = "http://127.0.0.1:8788/logvinov/gallery/";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 120)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto(base);
await page.locator(".archive-card").first().waitFor({ state: "visible", timeout: 15000 });
const step = async (name, fn) => {
  console.log("→", name);
  try {
    await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error("HANG: " + name)), 5000))]);
  } catch (e) { console.log("✗", name, String(e).slice(0, 200)); }
};

await step("open", () => page.locator(".archive-card-button").first().click());
await step("image visible", () => page.locator("#media-viewer-image").waitFor({ state: "visible" }));
console.log("level:", await page.locator("#media-zoom-level").textContent());
await step("zoom-in btn", () => page.getByRole("button", { name: "Увеличить изображение" }).click());
console.log("level:", await page.locator("#media-zoom-level").textContent());
const box = await page.locator("#media-viewer-image").boundingBox();
await step("mouse move", () => page.mouse.move(box.x + box.width / 2, box.y + box.height / 2));
await step("wheel up", () => page.mouse.wheel(0, -200));
console.log("level:", await page.locator("#media-zoom-level").textContent());
await step("wheel down", () => page.mouse.wheel(0, 200));
console.log("level:", await page.locator("#media-zoom-level").textContent());
await step("dblclick", () => page.locator("#media-viewer-image").dblclick());
console.log("level:", await page.locator("#media-zoom-level").textContent());
await step("dblclick2", () => page.locator("#media-viewer-image").dblclick());
console.log("level:", await page.locator("#media-zoom-level").textContent());
await step("key +", () => page.keyboard.press("+"));
console.log("level:", await page.locator("#media-zoom-level").textContent());
await step("key 0", () => page.keyboard.press("0"));
console.log("level:", await page.locator("#media-zoom-level").textContent());
await step("key + again", () => page.keyboard.press("+"));
await step("Escape", () => page.keyboard.press("Escape"));
await step("hidden", () => page.locator("#media-viewer").waitFor({ state: "hidden" }));
await step("reopen", () => page.locator(".archive-card-button").first().click());
await step("image visible 2", () => page.locator("#media-viewer-image").waitFor({ state: "visible" }));
console.log("level:", await page.locator("#media-zoom-level").textContent());
await browser.close();
server.close();
process.exit(0);
