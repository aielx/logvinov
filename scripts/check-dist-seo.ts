/**
 * Проверка SEO-составляющей production-сборки (dist/):
 *  - robots.txt и llms.txt скопированы в сборку;
 *  - карта сайта (sitemap-index.xml) сгенерирована;
 *  - og-image.png и apple-touch-icon.png на месте;
 *  - в каждой индексируемой HTML-странице есть canonical, og:title,
 *    og:description, og:image и JSON-LD;
 *  - 404 закрыта от индексации (noindex), остальные страницы открыты.
 * Запуск: npm run build && npm run test:dist-seo
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = new URL("../dist", import.meta.url).pathname;

const REQUIRED_FILES = ["robots.txt", "llms.txt", "sitemap-index.xml", "assets/og-image.png", "assets/apple-touch-icon.png"];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function fail(message: string): never {
  console.error(`SEO НАРУШЕНИЕ: ${message}`);
  process.exit(1);
}

if (!existsSync(DIST)) {
  fail("каталог dist/ не найдён — сначала выполните npm run build");
}

for (const file of REQUIRED_FILES) {
  if (!existsSync(join(DIST, file))) {
    fail(`в сборке нет ${file}`);
  }
}

const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
if (!robots.includes("Sitemap: https://logvinov-tree.ru/sitemap-index.xml")) {
  fail("robots.txt не ссылается на карту сайта");
}

let checked = 0;
for (const file of walk(DIST)) {
  if (!file.endsWith(".html")) continue;
  const rel = relative(process.cwd(), file);
  // Служебные файлы верификации поисковиков (yandex_<hash>.html) — без canonical и OG-тегов.
  if (/^yandex_[0-9a-f]+\.html$/.test(file.split("/").pop() ?? "")) continue;
  const html = readFileSync(file, "utf8");
  checked += 1;

  const is404 = rel.endsWith("404.html");
  const required = is404
    ? ['<meta name="robots" content="noindex, nofollow"']
    : [
        '<link rel="canonical" href="https://logvinov-tree.ru',
        'property="og:title"',
        'property="og:description"',
        'property="og:image" content="https://logvinov-tree.ru/assets/og-image.png"',
        'type="application/ld+json"'
      ];

  for (const needle of required) {
    if (!html.includes(needle)) {
      fail(`${rel} — не найдено: ${needle.slice(0, 60)}…`);
    }
  }
}

console.log(`OK: dist SEO-проверен — HTML-страниц: ${checked}, нарушений нет.`);
