/**
 * Генерация CSV-вкладок Google Sheet из демо-набора v2 (apps-script/src/Seed.ts).
 * Три файла в sheet-import/: Люди.csv, События.csv, Материалы.csv.
 *
 * Запуск: npm run gen:csv
 * Импорт: см. sheet-import/README-IMPORT.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO } from "../apps-script/src/Seed";
import { HEADERS, SERVICE_COLUMNS, SHEETS } from "../apps-script/src/Config";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../sheet-import");

function csvEscape(value: unknown): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const text = String(value ?? "");
  if (/[",;\n\r]/.test(text) || text.trim() !== text) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const body = rows.map((row) => row.map(csvEscape).join(","));
  return [headers.map(csvEscape).join(","), ...body].join("\r\n") + "\r\n";
}

// BOM: чтобы кириллица корректно открывалась и в Excel (Google Sheet понимает и без него).
const BOM = "\uFEFF";

const FILES: Array<{ file: string; sheet: string; rows: ReadonlyArray<ReadonlyArray<unknown>> }> = [
  { file: "Люди.csv", sheet: SHEETS.PEOPLE, rows: DEMO.people },
  { file: "События.csv", sheet: SHEETS.EVENTS, rows: DEMO.events },
  { file: "Материалы.csv", sheet: SHEETS.MATERIALS, rows: DEMO.materials }
];

mkdirSync(OUT_DIR, { recursive: true });
FILES.forEach(({ file, sheet, rows }) => {
  // Служебные колонки (например «Выбор») создаёт скрипт — в CSV им не место.
  const headers = (HEADERS[sheet] as string[]).filter((header) => !SERVICE_COLUMNS.includes(header));
  writeFileSync(resolve(OUT_DIR, file), BOM + toCsv(headers, rows), "utf8");
  console.log(`OK: sheet-import/${file} (${rows.length} строк)`);
});
console.log(`Готово: ${FILES.length} файла в ${OUT_DIR}`);
