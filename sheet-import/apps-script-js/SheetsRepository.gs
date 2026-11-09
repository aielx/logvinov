function recordsFromValues(sheetName, values) {
  const parsed = parseSheetValues(sheetName, values);
  return parsed.rows;
}
function missingRequiredHeaders(sheetName, values) {
  const required = REQUIRED_HEADERS[sheetName] ?? [];
  const headerRow = (values[0] ?? []).map((cell) => toText(cell));
  return required.filter((title) => !headerRow.includes(title));
}
function parseSheetValues(sheetName, values) {
  if (!values || values.length === 0) return { rows: [] };
  const fields = FIELDS[sheetName] ?? {};
  if (Object.keys(fields).length === 0) return { rows: [] };
  const columns = [];
  values[0].forEach((cell, index) => {
    const field = fields[toText(cell)];
    if (field) columns.push({ index, field });
  });
  const rows = [];
  for (let r = 1; r < values.length; r += 1) {
    const raw = values[r];
    if (raw.every((cell) => isBlank(cell))) continue;
    const record = { rowNumber: r + 1 };
    columns.forEach(({ index, field }) => {
      const cell = raw[index];
      record[field] = typeof cell === "boolean" ? cell ? "TRUE" : "FALSE" : toText(cell);
    });
    rows.push(record);
  }
  return { rows };
}
function headerColumnIndex(sheet, title) {
  return allHeaderColumnIndexes(sheet, title)[0] ?? -1;
}
function allHeaderColumnIndexes(sheet, title) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0] ?? [];
  const indexes = [];
  headerRow.forEach((cell, index) => {
    if (toText(cell) === title) indexes.push(index);
  });
  return indexes;
}
function readRawRecords() {
  const spreadsheet = getSpreadsheet();
  const raw = { people: [], events: [], materials: [], schemaErrors: [] };
  const readSheet = (name) => {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      raw.schemaErrors.push({ sheet: name, message: "\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0432\u043A\u043B\u0430\u0434\u043A\u0430" });
      return [];
    }
    const values = sheet.getDataRange().getValues();
    const missing = missingRequiredHeaders(name, values);
    if (missing.length > 0) {
      raw.schemaErrors.push({ sheet: name, message: `\u041D\u0435\u0442 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u043A\u043E\u043B\u043E\u043D\u043E\u043A: ${missing.join(", ")}` });
      return [];
    }
    return values;
  };
  raw.people = recordsFromValues(SHEETS.PEOPLE, readSheet(SHEETS.PEOPLE));
  raw.events = recordsFromValues(SHEETS.EVENTS, readSheet(SHEETS.EVENTS));
  raw.materials = recordsFromValues(SHEETS.MATERIALS, readSheet(SHEETS.MATERIALS));
  return raw;
}
function getSpreadsheet() {
  const bound = SpreadsheetApp.getActive();
  if (bound) return bound;
  const id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
  if (!id) {
    throw new Error("SPREADSHEET_ID \u043D\u0435 \u0437\u0430\u0434\u0430\u043D: \u043F\u0440\u0438\u0432\u044F\u0436\u0438\u0442\u0435 \u0441\u043A\u0440\u0438\u043F\u0442 \u043A \u0442\u0430\u0431\u043B\u0438\u0446\u0435 \u0438\u043B\u0438 \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0441\u0432\u043E\u0439\u0441\u0442\u0432\u043E.");
  }
  return SpreadsheetApp.openById(id);
}
function ensureStructure() {
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
function ensureHeaderRow(sheet, name, headers) {
  const firstRow = sheet.getRange(1, 1, 1, headers.length);
  if (isBlank(firstRow.getCell(1, 1).getValue())) {
    firstRow.setValues([headers]);
  }
  firstRow.setFontWeight("bold").setBackground("#EAE2D7");
  sheet.setFrozenRows(1);
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
    range.clearDataValidations();
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).setHelpText("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430 \u0438\u043B\u0438 \u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0435\u0441\u043B\u0438 \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E").build();
    range.setDataValidation(rule);
  });
  highlightDraftRows(sheet, name);
}
function applyPersonRefValidations() {
  const spreadsheet = getSpreadsheet();
  const peopleSheet = spreadsheet.getSheetByName(SHEETS.PEOPLE);
  if (!peopleSheet) return;
  ensureChoiceColumn(peopleSheet);
  const choiceIndex = headerColumnIndex(peopleSheet, "\u0412\u044B\u0431\u043E\u0440");
  if (choiceIndex === -1) return;
  const choiceRange = peopleSheet.getRange(2, choiceIndex + 1, validationRows(peopleSheet), 1);
  Object.entries(PERSON_REF_COLUMNS).forEach(([sheetName, columns]) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    columns.forEach((column) => {
      const index = headerColumnIndex(sheet, column);
      if (index === -1) return;
      const range = sheet.getRange(2, index + 1, validationRows(sheet), 1);
      range.clearDataValidations();
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
      const rule = SpreadsheetApp.newDataValidation().requireValueInRange(choiceRange, true).setAllowInvalid(true).setHelpText("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430").build();
      range.setDataValidation(rule);
    });
  });
}
function normalizePersonRefValues(spreadsheet) {
  const peopleSheet = spreadsheet.getSheetByName(SHEETS.PEOPLE);
  if (!peopleSheet) return;
  const numberIndex = headerColumnIndex(peopleSheet, "\u2116");
  const nameIndex = headerColumnIndex(peopleSheet, "\u0424\u0418\u041E");
  if (numberIndex === -1 || nameIndex === -1) return;
  const nameByNumber = /* @__PURE__ */ new Map();
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
        if (!match) return;
        const number = parseInt(match[1], 10);
        const name = nameByNumber.get(number);
        if (!name) return;
        const canonical = `${number} \xB7 ${name}`;
        if (text !== canonical) {
          try {
            sheet.getRange(offset + 2, index + 1).setValue(canonical);
          } catch (error) {
            console.warn(`\u041D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \xAB${column}\xBB, \u0441\u0442\u0440\u043E\u043A\u0430 ${offset + 2}: ${String(error).slice(0, 120)}`);
          }
        }
      });
    });
  });
}
function ensureChoiceColumn(sheet) {
  const indexes = allHeaderColumnIndexes(sheet, "\u0412\u044B\u0431\u043E\u0440");
  let choiceIndex;
  if (indexes.length === 0) {
    choiceIndex = Math.max(sheet.getLastColumn(), HEADERS[SHEETS.PEOPLE].length);
    sheet.getRange(1, choiceIndex + 1).setValue("\u0412\u044B\u0431\u043E\u0440");
  } else {
    choiceIndex = indexes[indexes.length - 1];
    indexes.slice(0, -1).forEach((staleIndex) => {
      try {
        sheet.getRange(1, staleIndex + 1).clearContent();
        sheet.getRange(2, staleIndex + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).clearContent();
      } catch (error) {
        console.warn(`\u041E\u0447\u0438\u0441\u0442\u043A\u0430 \u0441\u0442\u0430\u0440\u043E\u0439 \u043A\u043E\u043B\u043E\u043D\u043A\u0438 \xAB\u0412\u044B\u0431\u043E\u0440\xBB: ${String(error).slice(0, 120)}`);
      }
    });
  }
  try {
    const titleCell = sheet.getRange(1, choiceIndex + 1);
    if (isBlank(titleCell.getValue())) titleCell.setValue("\u0412\u044B\u0431\u043E\u0440");
    titleCell.setFontWeight("bold").setBackground("#EAE2D7");
    sheet.hideColumns(choiceIndex + 1);
    const locale = String(getSpreadsheet().getSpreadsheetLocale() || "en_US").toLowerCase();
    const commaLocales = ["en_", "ja_", "zh_", "ko_"];
    const separator = commaLocales.some((prefix) => locale.startsWith(prefix)) ? "," : ";";
    const formulaCell = sheet.getRange(2, choiceIndex + 1);
    formulaCell.clearContent();
    formulaCell.setFormula(`=ARRAYFORMULA(IF(TRIM(B2:B)${separator}""${separator}""${separator}A2:A&" \xB7 "&TRIM(B2:B)))`);
    const probe = String(formulaCell.getValue());
    if (probe.startsWith("#")) {
      formulaCell.setFormula(`=ARRAYFORMULA(IF(TRIM(B2:B);"";"";A2:A&" \xB7 "&TRIM(B2:B)))`);
    }
    const probe2 = String(formulaCell.getValue());
    if (probe2.startsWith("#")) {
      writeStaticChoiceValues(sheet);
    }
    const protection = sheet.getRange(2, choiceIndex + 1, validationRows(sheet), 1).protect();
    protection.setDescription("\u0421\u043B\u0443\u0436\u0435\u0431\u043D\u0430\u044F \u043A\u043E\u043B\u043E\u043D\u043A\u0430 \xAB\u0412\u044B\u0431\u043E\u0440\xBB: \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0444\u043E\u0440\u043C\u0443\u043B\u043E\u0439 \u0434\u043B\u044F \u0441\u043F\u0438\u0441\u043A\u043E\u0432 \u043F\u043E\u0434\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438.");
    protection.setWarningOnly(true);
  } catch (error) {
    console.warn(`\u041A\u043E\u043B\u043E\u043D\u043A\u0430 \xAB\u0412\u044B\u0431\u043E\u0440\xBB: ${String(error).slice(0, 120)}`);
  }
}
function writeStaticChoiceValues(sheet) {
  const numberIndex = headerColumnIndex(sheet, "\u2116");
  const nameIndex = headerColumnIndex(sheet, "\u0424\u0418\u041E");
  const choiceIndex = headerColumnIndex(sheet, "\u0412\u044B\u0431\u043E\u0440");
  if (numberIndex === -1 || nameIndex === -1 || choiceIndex === -1) return;
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const numbers = sheet.getRange(2, numberIndex + 1, lastRow - 1, 1).getValues();
  const names = sheet.getRange(2, nameIndex + 1, lastRow - 1, 1).getValues();
  const out = numbers.map((row, index) => {
    const number = parseInt(toText(row[0]), 10);
    const name = toText(names[index][0]);
    return [Number.isFinite(number) && number > 0 && name ? `${number} \xB7 ${name}` : ""];
  });
  sheet.getRange(2, choiceIndex + 1, out.length, 1).setValues(out);
}
function highlightDraftRows(sheet, sheetName) {
  const draftColumn = (CHECKBOX_COLUMNS[sheetName] ?? []).includes("\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A") ? headerColumnIndex(sheet, "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A") : -1;
  if (draftColumn === -1) return;
  const range = sheet.getRange(2, 1, validationRows(sheet), Math.max(sheet.getLastColumn(), 1));
  const rule = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=$${columnLetter(draftColumn + 1)}2=TRUE`).setBackground("#F3F3F3").setRanges([range]).build();
  sheet.setConditionalFormatRules([rule]);
}
function validationRows(sheet) {
  return Math.min(Math.max(sheet.getMaxRows() - 1, 1), Math.max(sheet.getLastRow() + 100, 200));
}
function columnLetter(index) {
  let letter = "";
  let n = index;
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}
function ensureInstructionsSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEETS.INSTRUCTIONS);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEETS.INSTRUCTIONS, 0);
  const content = [
    ["\u0421\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u0430\u0440\u0445\u0438\u0432 \u041B\u043E\u0433\u0432\u0438\u043D\u043E\u0432\u044B\u0445 \u2014 \u043A\u0440\u0430\u0442\u043A\u0430\u044F \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F", ""],
    ["", ""],
    ["1. \u041B\u044E\u0434\u0438 \u2014 \u043B\u0438\u0441\u0442 \xAB\u041B\u044E\u0434\u0438\xBB: \u043E\u0434\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 = \u043E\u0434\u0438\u043D \u0447\u0435\u043B\u043E\u0432\u0435\u043A. \u2116 \u043F\u0440\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0441\u0430\u043C \u043F\u0440\u0438 \u0432\u0432\u043E\u0434\u0435 \u0424\u0418\u041E.", "\u0415\u0441\u043B\u0438 \u2116 \u043F\u0443\u0441\u0442 \u2014 \u043C\u0435\u043D\u044E \xAB\u0421\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u0430\u0440\u0445\u0438\u0432 \u2192 \u041F\u0440\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043D\u043E\u043C\u0435\u0440\u0430\xBB."],
    ["2. \u0421\u0432\u044F\u0437\u0438 (\u041E\u0442\u0435\u0446 / \u041C\u0430\u0442\u044C / \u0421\u0443\u043F\u0440\u0443\u0433(\u0430) / \u0427\u0435\u043B\u043E\u0432\u0435\u043A / \u0427\u0435\u0439 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B) \u0432\u044B\u0431\u0438\u0440\u0430\u0439\u0442\u0435 \u0438\u0437 \u0432\u044B\u043F\u0430\u0434\u0430\u044E\u0449\u0435\u0433\u043E \u0441\u043F\u0438\u0441\u043A\u0430:", "\u0432 \u0441\u043F\u0438\u0441\u043A\u0435 \u0441\u0440\u0430\u0437\u0443 \u0432\u0438\u0434\u043D\u043E \xAB\u2116 \xB7 \u0424\u0418\u041E\xBB, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 \xAB3 \xB7 \u0418\u0432\u0430\u043D \u0418\u0432\u0430\u043D\u043E\u0432\u0438\u0447 \u041B\u043E\u0433\u0432\u0438\u043D\u043E\u0432\xBB."],
    ["3. \u0414\u0430\u0442\u044B \u043F\u0438\u0448\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442\u043E\u043C: 1890, 1937-03 \u0438\u043B\u0438 1937-03-14. \u0423 \u0436\u0438\u0432\u044B\u0445 \xAB\u0414\u0430\u0442\u0430 \u0441\u043C\u0435\u0440\u0442\u0438\xBB \u043F\u0443\u0441\u0442\u0430\u044F, \u0447\u0435\u043A\u0431\u043E\u043A\u0441 \xAB\u0416\u0438\u0432\u043E\u0439\xBB \u0432\u043A\u043B\u044E\u0447\u0451\u043D.", ""],
    ["4. \u0412\u0438\u0434\u0438\u043C\u043E\u0441\u0442\u044C: \xAB\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0435\xBB \u2014 \u0432\u0438\u0434\u044F\u0442 \u0432\u0441\u0435; \xAB\u0421\u0435\u043C\u0435\u0439\u043D\u043E\u0435\xBB \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u0441\u0435\u043C\u0435\u0439\u043D\u043E\u0433\u043E \u0432\u0445\u043E\u0434\u0430 \u043D\u0430 \u0441\u0430\u0439\u0442\u0435.", "\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u043E\u0441\u0442\u0438 \u0436\u0438\u0432\u044B\u0445 \u0440\u043E\u0434\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u043E\u0432 \u0432\u0441\u0435\u0433\u0434\u0430 \u0441\u0435\u043C\u0435\u0439\u043D\u044B\u0435, \u0447\u0442\u043E \u0431\u044B \u043D\u0438 \u0431\u044B\u043B\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043E."],
    ["5. \u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0435 \u0431\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u0438 \u0443\u043C\u0435\u0440\u0448\u0438\u0445 \u043F\u0443\u0431\u043B\u0438\u043A\u0443\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438. \u0427\u0442\u043E\u0431\u044B \u0437\u0430\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0443\u043C\u0435\u0440\u0448\u0435\u0433\u043E \u2014", "\u043F\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \xAB\u0412\u0438\u0434\u0438\u043C\u043E\u0441\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438\xBB = \u0421\u0435\u043C\u0435\u0439\u043D\u0430\u044F."],
    ["6. \u0421\u043E\u0431\u044B\u0442\u0438\u044F: \u0434\u0430\u0442\u0430-\u0433\u043E\u0434 (\u043C\u043E\u0436\u043D\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D \u0432 \xAB\u041A\u043E\u043D\u0435\u0446\xBB), \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A, \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435, \u0442\u0438\u043F (\u0421\u0435\u043C\u0435\u0439\u043D\u043E\u0435/\u0418\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u043E\u0435), \u043A\u0442\u043E.", ""],
    ["7. \u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B: \u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443 Google Drive \u0438\u043B\u0438 https, \u043B\u0438\u0431\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0443\u0442\u044C assets/\u2026 ; \u0443\u043A\u0430\u0436\u0438\u0442\u0435,", "\u0447\u0435\u0439 \u044D\u0442\u043E \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B \u0438 \u0440\u043E\u043B\u044C (\u041F\u043E\u0440\u0442\u0440\u0435\u0442/\u0413\u0430\u043B\u0435\u0440\u0435\u044F/\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442)."],
    ["8. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u043E\u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u043D\u0430 \u0441\u0430\u0439\u0442\u0435 \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 5 \u043C\u0438\u043D\u0443\u0442 \u0438\u043B\u0438 \u0441\u0440\u0430\u0437\u0443 \u0447\u0435\u0440\u0435\u0437 \u043C\u0435\u043D\u044E \xAB\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u043A\u044D\u0448\xBB.", ""],
    ["9. \u041E\u0448\u0438\u0431\u043A\u0438 \u0432 \u0441\u0442\u0440\u043E\u043A\u0430\u0445 \u043D\u0435 \u043B\u043E\u043C\u0430\u044E\u0442 \u0441\u0430\u0439\u0442: \u043C\u0435\u043D\u044E \xAB\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435\xBB \u043F\u0438\u0448\u0435\u0442 \u043E\u0442\u0447\u0451\u0442 \u043D\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \xAB\u041E\u0442\u0447\u0451\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438\xBB.", ""],
    ["10. \u0427\u0442\u043E\u0431\u044B \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u0441\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C \u2014 \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \xAB\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A\xBB. \u0423\u0434\u0430\u043B\u044F\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0438 \u043C\u043E\u0436\u043D\u043E \u0431\u0435\u0437 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0439.", ""],
    ["", ""],
    ["\u0414\u0435\u043C\u043E\u043D\u0441\u0442\u0440\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0435 \u0441\u0442\u0440\u043E\u043A\u0438 \u043C\u043E\u0436\u043D\u043E \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0438 \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u043C\u0438 \u0434\u0430\u043D\u043D\u044B\u043C\u0438.", ""]
  ];
  sheet.getRange(1, 1, content.length, 2).setValues(content);
  sheet.setColumnWidth(1, 620);
  sheet.setColumnWidth(2, 620);
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(13);
}
function ensureReportSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEETS.REPORT);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEETS.REPORT);
  sheet.getRange(1, 1, 1, 5).setValues([["\u0412\u043A\u043B\u0430\u0434\u043A\u0430", "\u0421\u0442\u0440\u043E\u043A\u0430", "ID/\u2116", "\u041A\u043E\u0434", "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435"]]).setFontWeight("bold");
  sheet.setFrozenRows(1);
}
function writeValidationReport(issues) {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEETS.REPORT);
  if (!sheet) return;
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 5).clearContent();
  if (issues.length === 0) {
    sheet.getRange(2, 1, 1, 5).setValues([["\u041E\u0448\u0438\u0431\u043E\u043A \u043D\u0435\u0442", "", "", "", "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u0440\u043E\u0448\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443"]]);
    return;
  }
  const rows = issues.map((issue) => [issue.sheet, issue.rowNumber, issue.recordId, issue.code, issue.message]);
  sheet.getRange(2, 1, rows.length, 5).setValues(rows);
}
function readDataRevision() {
  return PropertiesService.getScriptProperties().getProperty(PROP.DATA_REVISION) ?? DEFAULT_DATA_REVISION;
}
function bumpDataRevision() {
  const next = String(parseInt(readDataRevision(), 10) + 1);
  PropertiesService.getScriptProperties().setProperty(PROP.DATA_REVISION, next);
  return next;
}
function nextPersonNumber(sheet) {
  const values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  let max = 0;
  values.forEach((row) => {
    const number = parseInt(toText(row[0]), 10);
    if (Number.isFinite(number)) max = Math.max(max, number);
  });
  return max + 1;
}
function fillMissingPersonNumbers() {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEETS.PEOPLE);
  if (!sheet) return 0;
  const headers = HEADERS[SHEETS.PEOPLE];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const numbers = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const names = sheet.getRange(2, headers.indexOf("\u0424\u0418\u041E") + 1, lastRow - 1, 1).getValues();
  let filled = 0;
  numbers.forEach((value, index) => {
    if (!isBlank(value[0]) || isBlank(names[index][0])) return;
    sheet.getRange(index + 2, 1).setValue(nextPersonNumber(sheet));
    filled += 1;
  });
  return filled;
}
function autoFillOnEdit(e) {
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  const headers = HEADERS[name];
  if (!headers) return;
  const row = e.range.getRow();
  if (row < 2) return;
  if (name === SHEETS.PEOPLE) {
    const numberIndex = headerColumnIndex(sheet, "\u2116");
    const nameIndex = headerColumnIndex(sheet, "\u0424\u0418\u041E");
    const numberCell = numberIndex === -1 ? null : sheet.getRange(row, numberIndex + 1);
    const nameCell = nameIndex === -1 ? null : sheet.getRange(row, nameIndex + 1);
    if (numberCell && nameCell && isBlank(numberCell.getValue()) && !isBlank(nameCell.getValue())) {
      numberCell.setValue(nextPersonNumber(sheet));
    }
    const choiceIndex = headerColumnIndex(sheet, "\u0412\u044B\u0431\u043E\u0440");
    if (choiceIndex !== -1 && isBlank(sheet.getRange(2, choiceIndex + 1).getFormula())) {
      writeStaticChoiceValues(sheet);
    }
  }
}

