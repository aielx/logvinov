/**
 * Генерация чистого JavaScript (.gs) из apps-script/src/*.ts для копипасты
 * в веб-редактор Apps Script без clasp. TS-типы убираются, import/export
 * вырезаются (в Apps Script все файлы одного проекта — общая область имён).
 *
 * Запуск: npm run gen:gs → sheet-import/apps-script-js/
 * Проверка: каждый файл проходит node --check.
 */
import { readdirSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../apps-script/src");
const OUT = resolve(HERE, "../sheet-import/apps-script-js");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((file) => file.endsWith(".ts"));
files.forEach((file) => {
  // 1) Убираем import-инструкции ДО трансформации: в Apps Script все файлы
  //    проекта видят друг друга как глобальные, import/export не нужны.
  const withoutImports = readFileSync(join(SRC, file), "utf8").replace(
    /import\s[\s\S]*?from\s+["'][^"']+["'];?/g,
    ""
  );
  // 2) Снимаем TS-типы, затем убираем любые формы export:
  //    esm-формат собирает именованные экспорты в блок "export { … }" в конце файла.
  const source = transformSync(withoutImports, {
    loader: "ts",
    format: "esm",
    target: "es2020"
  }).code;
  const globalScript = source
    .replace(/export\s*\{[\s\S]*?\};?/g, "")
    .replace(/\bexport\s+(?=(?:function|const|class|let|var)\b)/g, "")
    .replace(/\bexport\s+default\s+/g, "");
  const target = join(OUT, basename(file).replace(/\.ts$/, ".gs"));
  writeFileSync(target, globalScript, "utf8");
  console.log(`OK: sheet-import/apps-script-js/${basename(target)}`);
});

copyFileSync(resolve(HERE, "../apps-script/appsscript.json"), join(OUT, "appsscript.json"));
console.log("OK: sheet-import/apps-script-js/appsscript.json");
