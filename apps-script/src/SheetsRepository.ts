/**
 * Доступ к закрытой Google Sheet (схема v2): три вкладки — Люди / События / Материалы.
 *
 * Удобство редактора:
 *  - колонки «Отец (№)», «Мать (№)», «Супруг(а) (№)», «Человек (№)», «Чей материал (№)»
 *    получают подстановку (dropdown) из столбца «№» листа «Люди»;
 *  - рядом авто-колонки «(кто)» показывают ФИО по выбранному номеру (VLOOKUP);
 *  - «№» нового человека проставляется автоматически при вводе ФИО (onEdit)
 *    или через меню «Проставить номера».
 */
import {
  CHECKBOX_COLUMNS,
  FIELDS,
  DEFAULT_DATA_REVISION,
  HEADERS,
  LIST_VALIDATIONS,
  PERSON_REF_COLUMNS,
  REVISION_CACHE_KEY,
  REQUIRED_HEADERS,
  SERVICE_COLUMNS,
  PROP,
  SHEETS
} from "./Config";
import { DataIssue, RawRecords } from "./Types";
import { isBlank, toText } from "./Util";

/**
 * Чистый маппинг значений вкладки в записи (тестируется без SpreadsheetApp).
 * Колонки определяются по ЗАГОЛОВКАМ в строке 1 — порядок и лишние колонки не важны.
 */
export function recordsFromValues(sheetName: string, values: unknown[][]): Record<string, unknown>[] {
  const parsed = parseSheetValues(sheetName, values);
  return parsed.rows;
}

/** Проверка обязательных заголовков: без них вкладка нерабочая. */
export function missingRequiredHeaders(sheetName: string, values: unknown[][]): string[] {
  const required = REQUIRED_HEADERS[sheetName] ?? [];
  const headerRow = (values[0] ?? []).map((cell) => toText(cell));
  return required.filter((title) => !headerRow.includes(title));
}

function parseSheetValues(sheetName: string, values: unknown[][]): { rows: Record<string, unknown>[] } {
  if (!values || values.length === 0) return { rows: [] };
  const fields = FIELDS[sheetName] ?? {};
  if (Object.keys(fields).length === 0) return { rows: [] };
  // Колонка → поле: ищем по фактическому заголовку в строке 1.
  const columns: Array<{ index: number; field: string }> = [];
  values[0].forEach((cell, index) => {
    const field = fields[toText(cell)];
    if (field) columns.push({ index, field });
  });
  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < values.length; r += 1) {
    const raw = values[r];
    if (raw.every((cell) => isBlank(cell))) continue;
    const record: Record<string, unknown> = { rowNumber: r + 1 };
    columns.forEach(({ index, field }) => {
      const cell = raw[index];
      // Чекбоксы приходят boolean — в текст для единой нормализации.
      record[field] = typeof cell === "boolean" ? (cell ? "TRUE" : "FALSE") : toText(cell);
    });
    rows.push(record);
  }
  return { rows };
}

/** Индекс колонки по фактическому заголовку строки 1 (или -1). */
function headerColumnIndex(sheet: GoogleAppsScript.Spreadsheet.Sheet, title: string): number {
  return allHeaderColumnIndexes(sheet, title)[0] ?? -1;
}

/** Все колонки с данным заголовком (для поиска дублей служебных колонок). */
function allHeaderColumnIndexes(sheet: GoogleAppsScript.Spreadsheet.Sheet, title: string): number[] {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0] ?? [];
  const indexes: number[] = [];
  headerRow.forEach((cell, index) => {
    if (toText(cell) === title) indexes.push(index);
  });
  return indexes;
}

export function readRawRecords(): RawRecords {
  const spreadsheet = getSpreadsheet();
  const raw: RawRecords = { people: [], events: [], materials: [], schemaErrors: [] };

  const readSheet = (name: string): unknown[][] => {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      raw.schemaErrors.push({ sheet: name, message: "Отсутствует вкладка" });
      return [];
    }
    const values = sheet.getDataRange().getValues();
    const missing = missingRequiredHeaders(name, values);
    if (missing.length > 0) {
      raw.schemaErrors.push({ sheet: name, message: `Нет обязательных колонок: ${missing.join(", ")}` });
      return [];
    }
    return values;
  };

  raw.people = recordsFromValues(SHEETS.PEOPLE, readSheet(SHEETS.PEOPLE)) as never;
  raw.events = recordsFromValues(SHEETS.EVENTS, readSheet(SHEETS.EVENTS)) as never;
  raw.materials = recordsFromValues(SHEETS.MATERIALS, readSheet(SHEETS.MATERIALS)) as never;
  return raw;
}

/** Контейнерный скрипт использует активную таблицу; автономный — SPREADSHEET_ID из свойств. */
export function getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  const bound = SpreadsheetApp.getActive();
  if (bound) return bound;
  const id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
  if (!id) {
    throw new Error("SPREADSHEET_ID не задан: привяжите скрипт к таблице или заполните свойство.");
  }
  return SpreadsheetApp.openById(id);
}

// ---------------------------------------------------------------------------
// Структура вкладок, чекбоксы, списки подстановки
// ---------------------------------------------------------------------------

export function ensureStructure(): void {
  const spreadsheet = getSpreadsheet();
  Object.entries(HEADERS).forEach(([name, headers]) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    ensureHeaderRow(sheet, name, headers);
  });
  ensureInstructionsSheet(spreadsheet);
  ensureReportSheet(spreadsheet);
  applyPersonRefValidations();
}

function ensureHeaderRow(sheet: GoogleAppsScript.Spreadsheet.Sheet, name: string, headers: string[]): void {
  const firstRow = sheet.getRange(1, 1, 1, headers.length);
  if (isBlank(firstRow.getCell(1, 1).getValue())) {
    firstRow.setValues([headers]);
  }
  firstRow.setFontWeight("bold").setBackground("#EAE2D7");
  sheet.setFrozenRows(1);

  // Чекбоксы и списки ставим по ФАКТИЧЕСКИМ заголовкам строки 1 —
  // порядок колонок и лишние колонки не влияют.
  (CHECKBOX_COLUMNS[name] ?? []).forEach((column) => {
    const index = headerColumnIndex(sheet, column);
    if (index !== -1) {
      sheet.getRange(2, index + 1, validationRows(sheet), 1).insertCheckboxes();
    }
  });

  Object.entries(LIST_VALIDATIONS[name] ?? {}).forEach(([column, values]) => {
    const index = headerColumnIndex(sheet, column);
    if (index === -1) return;
    const range = sheet.getRange(2, index + 1, validationRows(sheet), 1);
    range.clearDataValidations(); // заменить правило целиком, а не наслаивать
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(values, true)
      .setAllowInvalid(true)
      .setHelpText("Выберите значение из списка или оставьте пустым, если допустимо")
      .build();
    range.setDataValidation(rule);
  });

  highlightDraftRows(sheet, name);
}

/**
 * Подстановка (dropdown) для колонок связей: значения «№ · ФИО» берутся
 * из служебной колонки «Выбор» листа «Люди». Перед установкой правил:
 * старые правила очищаются, а значения ячеек приводятся к каноническому
 * «№ · ФИО» по текущим данным листа «Люди» — иначе мелкие отличия
 * (пробел, ручная правка) дают ложную пометку «недопустимое значение».
 */
export function applyPersonRefValidations(): void {
  const spreadsheet = getSpreadsheet();
  const peopleSheet = spreadsheet.getSheetByName(SHEETS.PEOPLE);
  if (!peopleSheet) return;
  ensureChoiceColumn(peopleSheet);
  const choiceIndex = headerColumnIndex(peopleSheet, "Выбор");
  if (choiceIndex === -1) return;
  const choiceRange = peopleSheet.getRange(2, choiceIndex + 1, validationRows(peopleSheet), 1);

  Object.entries(PERSON_REF_COLUMNS).forEach(([sheetName, columns]) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    columns.forEach((column) => {
      const index = headerColumnIndex(sheet, column);
      if (index === -1) return; // колонки нет (старая раскладка) — пропускаем безопасно
      const range = sheet.getRange(2, index + 1, validationRows(sheet), 1);
      range.clearDataValidations(); // убрать правила от прошлых попыток/раскладок
    });
  });

  normalizePersonRefValues(spreadsheet);

  Object.entries(PERSON_REF_COLUMNS).forEach(([sheetName, columns]) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    columns.forEach((column) => {
      const index = headerColumnIndex(sheet, column);
      if (index === -1) return;
      const range = sheet.getRange(2, index + 1, validationRows(sheet), 1);
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInRange(choiceRange, true)
        .setAllowInvalid(true)
        .setHelpText("Выберите человека из списка")
        .build();
      range.setDataValidation(rule);
    });
  });
}

/**
 * Приведение значений связей к виду «№ · ФИО» (источник — лист «Люди»).
 * Бонус: после переименования человека ячейки связей обновляются сами.
 */
function normalizePersonRefValues(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  const peopleSheet = spreadsheet.getSheetByName(SHEETS.PEOPLE);
  if (!peopleSheet) return;
  const numberIndex = headerColumnIndex(peopleSheet, "№");
  const nameIndex = headerColumnIndex(peopleSheet, "ФИО");
  if (numberIndex === -1 || nameIndex === -1) return;

  const nameByNumber = new Map<number, string>();
  const lastRow = peopleSheet.getLastRow();
  if (lastRow >= 2) {
    const numbers = peopleSheet.getRange(2, numberIndex + 1, lastRow - 1, 1).getValues();
    const names = peopleSheet.getRange(2, nameIndex + 1, lastRow - 1, 1).getValues();
    numbers.forEach((row, index) => {
      const number = parseInt(toText(row[0]), 10);
      const name = toText(names[index][0]);
      if (Number.isFinite(number) && number > 0 && name) {
        nameByNumber.set(number, name);
      }
    });
  }

  Object.entries(PERSON_REF_COLUMNS).forEach(([sheetName, columns]) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    const lastSheetRow = sheet.getLastRow();
    if (lastSheetRow < 2) return;
    columns.forEach((column) => {
      const index = headerColumnIndex(sheet, column);
      if (index === -1) return;
      const values = sheet.getRange(2, index + 1, lastSheetRow - 1, 1).getValues();
      values.forEach((row, offset) => {
        const text = toText(row[0]);
        if (text === "") return;
        const match = /^\s*(\d+)/.exec(text);
        if (!match) return; // без № в начале — оставляем, отчёт проверки подскажет
        const number = parseInt(match[1], 10);
        const name = nameByNumber.get(number);
        if (!name) return; // человека с таким № нет — оставляем как есть
        const canonical = `${number} · ${name}`;
        if (text !== canonical) {
          try {
            sheet.getRange(offset + 2, index + 1).setValue(canonical);
          } catch (error) {
            console.warn(`Нормализация «${column}», строка ${offset + 2}: ${String(error).slice(0, 120)}`);
          }
        }
      });
    });
  });
}

/**
 * Служебная колонка «Выбор» на листе «Люди»: одна живая формула склеивает
 * «№ · ФИО» для всех строк. Если от прошлых попыток остались дубли колонки
 * «Выбор» — они очищаются (колонка служебная, владельцем является скрипт).
 */
function ensureChoiceColumn(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
  const indexes = allHeaderColumnIndexes(sheet, "Выбор");
  let choiceIndex: number;
  if (indexes.length === 0) {
    choiceIndex = Math.max(sheet.getLastColumn(), HEADERS[SHEETS.PEOPLE].length);
    sheet.getRange(1, choiceIndex + 1).setValue("Выбор");
  } else {
    choiceIndex = indexes[indexes.length - 1]; // последняя — рабочая
    indexes.slice(0, -1).forEach((staleIndex) => {
      try {
        sheet.getRange(1, staleIndex + 1).clearContent();
        sheet.getRange(2, staleIndex + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).clearContent();
      } catch (error) {
        console.warn(`Очистка старой колонки «Выбор»: ${String(error).slice(0, 120)}`);
      }
    });
  }
  try {
    const titleCell = sheet.getRange(1, choiceIndex + 1);
    if (isBlank(titleCell.getValue())) titleCell.setValue("Выбор");
    titleCell.setFontWeight("bold").setBackground("#EAE2D7");
    sheet.hideColumns(choiceIndex + 1);

    // setFormula чувствителен к локали: в ru_RU аргументы разделяются «;»,
    // в en_US — «,». Подбираем разделитель; если формула всё равно не парсится —
    // переходим на статические значения (без формул) + обновление через onEdit.
    const locale = String(getSpreadsheet().getSpreadsheetLocale() || "en_US").toLowerCase();
    const commaLocales = ["en_", "ja_", "zh_", "ko_"];
    const separator = commaLocales.some((prefix) => locale.startsWith(prefix)) ? "," : ";";
    const formulaCell = sheet.getRange(2, choiceIndex + 1);
    formulaCell.clearContent();
    formulaCell.setFormula(`=ARRAYFORMULA(IF(TRIM(B2:B)${separator}""${separator}""${separator}A2:A&" · "&TRIM(B2:B)))`);
    const probe = String(formulaCell.getValue());
    if (probe.startsWith("#")) {
      formulaCell.setFormula(`=ARRAYFORMULA(IF(TRIM(B2:B);"";"";A2:A&" · "&TRIM(B2:B)))`);
    }
    const probe2 = String(formulaCell.getValue());
    if (probe2.startsWith("#")) {
      writeStaticChoiceValues(sheet);
    }

    const protection = sheet.getRange(2, choiceIndex + 1, validationRows(sheet), 1).protect();
    protection.setDescription("Служебная колонка «Выбор»: заполняется формулой для списков подстановки.");
    protection.setWarningOnly(true);
  } catch (error) {
    console.warn(`Колонка «Выбор»: ${String(error).slice(0, 120)}`);
  }
}

/**
 * Статический режим колонки «Выбор» (запасной, если формулы не парсятся в локали):
 * значения «№ · ФИО» пишутся текстом; onEdit и меню их обновляют.
 */
function writeStaticChoiceValues(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
  const numberIndex = headerColumnIndex(sheet, "№");
  const nameIndex = headerColumnIndex(sheet, "ФИО");
  const choiceIndex = headerColumnIndex(sheet, "Выбор");
  if (numberIndex === -1 || nameIndex === -1 || choiceIndex === -1) return;
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const numbers = sheet.getRange(2, numberIndex + 1, lastRow - 1, 1).getValues();
  const names = sheet.getRange(2, nameIndex + 1, lastRow - 1, 1).getValues();
  const out = numbers.map((row, index) => {
    const number = parseInt(toText(row[0]), 10);
    const name = toText(names[index][0]);
    return [Number.isFinite(number) && number > 0 && name ? `${number} · ${name}` : ""];
  });
  sheet.getRange(2, choiceIndex + 1, out.length, 1).setValues(out);
}

function highlightDraftRows(sheet: GoogleAppsScript.Spreadsheet.Sheet, sheetName: string): void {
  const draftColumn = (CHECKBOX_COLUMNS[sheetName] ?? []).includes("Черновик") ? headerColumnIndex(sheet, "Черновик") : -1;
  if (draftColumn === -1) return;
  const range = sheet.getRange(2, 1, validationRows(sheet), Math.max(sheet.getLastColumn(), 1));
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$${columnLetter(draftColumn + 1)}2=TRUE`)
    .setBackground("#F3F3F3")
    .setRanges([range])
    .build();
  sheet.setConditionalFormatRules([rule]);
}

/** Сколько строк охватывать чекбоксами/списками: последняя строка данных + запас. */
function validationRows(sheet: GoogleAppsScript.Spreadsheet.Sheet): number {
  return Math.min(Math.max(sheet.getMaxRows() - 1, 1), Math.max(sheet.getLastRow() + 100, 200));
}

function columnLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function ensureInstructionsSheet(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = spreadsheet.getSheetByName(SHEETS.INSTRUCTIONS);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEETS.INSTRUCTIONS, 0);
  // setValues требует строгую прямоугольность: каждая строка ровно 2 колонки.
  const content: unknown[][] = [
    ["Семейный архив Логвиновых — краткая инструкция", ""],
    ["", ""],
    ["1. Люди — лист «Люди»: одна строка = один человек. № проставляется сам при вводе ФИО.", "Если № пуст — меню «Семейный архив → Проставить номера»."],
    ["2. Связи (Отец / Мать / Супруг(а) / Человек / Чей материал) выбирайте из выпадающего списка:", "в списке сразу видно «№ · ФИО», например «3 · Иван Иванович Логвинов»."],
    ["3. Даты пишите текстом: 1890, 1937-03 или 1937-03-14. У живых «Дата смерти» пустая, чекбокс «Живой» включён.", ""],
    ["4. Видимость: «Публичное» — видят все; «Семейное» — только после семейного входа на сайте.", "Подробности живых родственников всегда семейные, что бы ни было выбрано."],
    ["5. Публичные биографии умерших публикуются автоматически. Чтобы закрыть карточку умершего —", "поставьте «Видимость карточки» = Семейная."],
    ["6. События: дата-год (можно диапазон в «Конец»), заголовок, описание, тип (Семейное/Историческое), кто.", ""],
    ["7. Материалы: вставьте ссылку Google Drive или https, либо локальный путь assets/… ; укажите,", "чей это материал и роль (Портрет/Галерея/Документ)."],
    ["8. Изменения появляются на сайте в течение 5 минут или сразу через меню «Обновить публичный кэш».", ""],
    ["9. Ошибки в строках не ломают сайт: меню «Проверить данные» пишет отчёт на вкладку «Отчёт проверки».", ""],
    ["10. Чтобы временно скрыть запись — включите «Черновик». Удалять строки можно без ограничений.", ""],
    ["", ""],
    ["Демонстрационные строки можно удалить и заполнить реальными данными.", ""]
  ];
  sheet.getRange(1, 1, content.length, 2).setValues(content);
  sheet.setColumnWidth(1, 620);
  sheet.setColumnWidth(2, 620);
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(13);
}

function ensureReportSheet(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = spreadsheet.getSheetByName(SHEETS.REPORT);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEETS.REPORT);
  sheet.getRange(1, 1, 1, 5).setValues([["Вкладка", "Строка", "ID/№", "Код", "Описание"]]).setFontWeight("bold");
  sheet.setFrozenRows(1);
}

/** Запись закрытого отчёта валидации (для редакторов таблицы, не для API). */
export function writeValidationReport(issues: DataIssue[]): void {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEETS.REPORT);
  if (!sheet) return;
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 5).clearContent();
  if (issues.length === 0) {
    sheet.getRange(2, 1, 1, 5).setValues([["Ошибок нет", "", "", "", "Данные прошли проверку"]]);
    return;
  }
  const rows = issues.map((issue) => [issue.sheet, issue.rowNumber, issue.recordId, issue.code, issue.message]);
  sheet.getRange(2, 1, rows.length, 5).setValues(rows);
}

// ---------------------------------------------------------------------------
// Ревизия данных (Script Properties) и автозаполнение №
// ---------------------------------------------------------------------------

export function readDataRevision(): string {
  return PropertiesService.getScriptProperties().getProperty(PROP.DATA_REVISION) ?? DEFAULT_DATA_REVISION;
}

/** Рост ревизии делает ключи кэша ответов (публичных и приватных) недействительными немедленно. */
export function bumpDataRevision(): string {
  const next = String(parseInt(readDataRevision(), 10) + 1);
  PropertiesService.getScriptProperties().setProperty(PROP.DATA_REVISION, next);
  try {
    // Обновляем и ячейку кэша ревизии, иначе «Обновить публичный кэш» догонял бы до 60 с.
    CacheService.getScriptCache().put(REVISION_CACHE_KEY, next, 60);
  } catch {
    // Кэш не критичен.
  }
  return next;
}

/** Следующий свободный № человека. */
export function nextPersonNumber(sheet: GoogleAppsScript.Spreadsheet.Sheet): number {
  const values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  let max = 0;
  values.forEach((row) => {
    const number = parseInt(toText(row[0]), 10);
    if (Number.isFinite(number)) max = Math.max(max, number);
  });
  return max + 1;
}

/** Меню «Проставить номера»: заполняет пустые № у людей с заполненным ФИО. */
export function fillMissingPersonNumbers(): number {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEETS.PEOPLE);
  if (!sheet) return 0;
  const headers = HEADERS[SHEETS.PEOPLE];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const numbers = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const names = sheet.getRange(2, headers.indexOf("ФИО") + 1, lastRow - 1, 1).getValues();
  let filled = 0;
  let nextNumber = nextPersonNumber(sheet);
  const out: unknown[][] = numbers.map((value, index) => {
    if (!isBlank(value[0]) || isBlank(names[index][0])) return [value[0]];
    filled += 1;
    return [nextNumber++];
  });
  if (filled > 0) {
    sheet.getRange(2, 1, out.length, 1).setValues(out);
    refreshStaticChoice(sheet);
  }
  return filled;
}

/**
 * Простой триггер onEdit (см. onEdit в Code.ts): № новому человеку — всем строкам
 * изменённого диапазона (вставка нескольких строк сразу) — и обновление
 * списка подстановки в статическом режиме «Выбора».
 *
 * Любая правка в листах данных поднимает ревизию: кэш ответов API
 * сбрасывается немедленно, и сайт показывает свежие данные при следующей
 * загрузке страницы — без ожидания TTL.
 */
export function autoFillOnEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  const headers = HEADERS[name];
  if (!headers) return;
  try {
    bumpDataRevision();
  } catch (error) {
    console.warn(`onEdit: не поднять ревизию: ${String(error).slice(0, 120)}`);
  }
  const firstRow = e.range.getRow();
  if (firstRow < 2) return;

  if (name === SHEETS.PEOPLE) {
    const numberIndex = headerColumnIndex(sheet, "№");
    const nameIndex = headerColumnIndex(sheet, "ФИО");
    if (numberIndex !== -1 && nameIndex !== -1) {
      const rows = Math.min(e.range.getNumRows(), 100);
      const names = sheet.getRange(firstRow, nameIndex + 1, rows, 1).getValues();
      const numbers = sheet.getRange(firstRow, numberIndex + 1, rows, 1).getValues();
      let nextNumber = nextPersonNumber(sheet);
      let changed = false;
      const out = numbers.map((row, index) => {
        if (!isBlank(row[0]) || isBlank(names[index][0])) return [row[0]];
        changed = true;
        return [nextNumber++];
      });
      if (changed) sheet.getRange(firstRow, numberIndex + 1, rows, 1).setValues(out);
    }
    refreshStaticChoice(sheet);
  }
}

/** В статическом режиме «Выбора» (формула не прижилась) пересобрать значения списка. */
function refreshStaticChoice(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
  const choiceIndex = headerColumnIndex(sheet, "Выбор");
  if (choiceIndex === -1) return;
  if (isBlank(sheet.getRange(2, choiceIndex + 1).getFormula())) {
    writeStaticChoiceValues(sheet);
  }
}
