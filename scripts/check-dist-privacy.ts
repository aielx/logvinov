/**
 * Проверка приватности production-сборки (dist/):
 *  - canary-строки демо-приватных данных;
 *  - демонстрационный пароль макета;
 *  - приватные driveFileId и семейные внешние URL;
 *  - содержимое family-archive-mock в сборке;
 *  - source maps.
 * Скрипт сообщает только файл и тип нарушения, не печатая найденные значения.
 * Запуск: npm run build && npm run test:dist-privacy
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = new URL("../dist", import.meta.url).pathname;

const FORBIDDEN_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: "canary-строка приватных демо-данных", pattern: /CANARY/i },
  { type: "демо-пароль макета", pattern: /семья2025/ },
  { type: "приватный driveFileId демо-данных", pattern: /CANARYDRIVEFILEID0001/ },
  { type: "семейная внешняя ссылка демо-данных", pattern: /example\.org\/family\//i },
  { type: "маркер приватности макета", pattern: /familyArchivePrivate/ }
];

const TEXT_EXTENSIONS = [".html", ".js", ".css", ".json", ".svg", ".txt", ".xml", ".webmanifest"];

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
  console.error(`НАРУШЕНИЕ ПРИВАТНОСТИ: ${message}`);
  process.exit(1);
}

if (!existsSync(DIST)) {
  fail("каталог dist/ не найден — сначала выполните npm run build");
}

let scanned = 0;
let violations = 0;
for (const file of walk(DIST)) {
  const rel = relative(process.cwd(), file);
  scanned += 1;

  if (file.endsWith(".map")) {
    console.error(`НАРУШЕНИЕ: ${rel} — source map в сборке`);
    violations += 1;
  }
  if (rel.includes("family-archive-mock")) {
    console.error(`НАРУШЕНИЕ: ${rel} — содержимое макета попало в dist`);
    violations += 1;
  }
  if (!TEXT_EXTENSIONS.some((extension) => file.endsWith(extension))) continue;

  const content = readFileSync(file, "utf8");
  for (const { type, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      console.error(`НАРУШЕНИЕ: ${rel} — ${type}`);
      violations += 1;
    }
  }
}

if (violations > 0) {
  fail(`найдено нарушений: ${violations}`);
}

console.log(`OK: dist приватен — проверено файлов: ${scanned}, нарушений нет.`);
