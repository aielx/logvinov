function doGet(e) {
  return handleGet(e ?? { parameter: {} });
}
function doPost(e) {
  return handlePost(e ?? { parameter: {} });
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu("\u0421\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u0430\u0440\u0445\u0438\u0432").addItem("\u041F\u0440\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043D\u043E\u043C\u0435\u0440\u0430 \u043B\u044E\u0434\u044F\u043C", "menuFillNumbers").addItem("\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435", "menuValidateData").addItem("\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u043A\u044D\u0448", "menuRefreshCache").addItem("\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043A\u0438 \u043F\u043E\u0434\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438", "menuRefreshDropdowns").addSeparator().addItem("\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0441\u0435\u0441\u0441\u0438\u0438 (\u0447\u0438\u0441\u043B\u043E)", "menuSessionCount").addToUi();
}
function menuFillNumbers() {
  const filled = fillMissingPersonNumbers();
  SpreadsheetApp.getUi().alert(`\u041F\u0440\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u043D\u043E\u043C\u0435\u0440\u043E\u0432: ${filled}.`);
}
function menuRefreshDropdowns() {
  applyPersonRefValidations();
  SpreadsheetApp.getUi().alert("\u0421\u043F\u0438\u0441\u043A\u0438 \u043F\u043E\u0434\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 (\u2116 \u043B\u044E\u0434\u0435\u0439) \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B.");
}
function menuValidateData() {
  const raw = readRawRecords();
  const archive = validateArchive(raw);
  writeValidationReport(archive.issues);
  SpreadsheetApp.getUi().alert(
    archive.issues.length === 0 ? "\u041E\u0448\u0438\u0431\u043E\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E: \u0434\u0430\u043D\u043D\u044B\u0435 \u0433\u043E\u0442\u043E\u0432\u044B \u043A \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u0438." : `\u041D\u0430\u0439\u0434\u0435\u043D\u043E \u043F\u0440\u043E\u0431\u043B\u0435\u043C: ${archive.issues.length}. \u041E\u0442\u0447\u0451\u0442 \u2014 \u043D\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0435 \xAB\u041E\u0442\u0447\u0451\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438\xBB.`
  );
}
function menuRefreshCache() {
  const revision = bumpDataRevision();
  SpreadsheetApp.getUi().alert(`\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u043A\u044D\u0448 \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D (dataRevision=${revision}). \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043D\u0430 \u0441\u0430\u0439\u0442\u0435 \u0441\u0440\u0430\u0437\u0443.`);
}
function menuSessionCount() {
  SpreadsheetApp.getUi().alert(`\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0441\u0435\u043C\u0435\u0439\u043D\u044B\u0445 \u0441\u0435\u0441\u0441\u0438\u0439: ${countSessions()}.`);
}
function setup() {
  ensureStructure();
  seedDemoData();
  const spreadsheet = getSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP.SPREADSHEET_ID)) {
    props.setProperty(PROP.SPREADSHEET_ID, spreadsheet.getId());
  }
  console.info("setup: \u0433\u043E\u0442\u043E\u0432\u043E (\u043B\u0438\u0441\u0442\u044B, \u0441\u043F\u0438\u0441\u043A\u0438, \u0444\u043E\u0440\u043C\u0443\u043B\u044B, \u0441\u0432\u043E\u0439\u0441\u0442\u0432\u0430). \u041F\u0430\u0440\u043E\u043B\u044C \u0437\u0430\u0434\u0430\u0451\u0442\u0441\u044F \u0444\u0443\u043D\u043A\u0446\u0438\u0435\u0439 setupFamilyPassword.");
}
function setFamilyPasswordAndRevoke(password) {
  const pass = password ?? "";
  if (pass.length < MIN_FAMILY_PASSWORD_LENGTH) {
    throw new Error(`\u041F\u0430\u0440\u043E\u043B\u044C \u043D\u0435 \u0437\u0430\u0434\u0430\u043D \u0438\u043B\u0438 \u043A\u043E\u0440\u043E\u0447\u0435 ${MIN_FAMILY_PASSWORD_LENGTH} \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0444\u0443\u043D\u043A\u0446\u0438\u044E setupFamilyPassword().`);
  }
  setFamilyPassword(pass);
}
function setupFamilyPassword() {
  setFamilyPasswordAndRevoke("\u0412\u041F\u0418\u0428\u0418\u0422\u0415_\u041F\u0410\u0420\u041E\u041B\u042C_\u0417\u0414\u0415\u0421\u042C");
}
function revokeAllSessions() {
  const removed = revokeAllSessionsByEpoch();
  console.info(`Revoked sessions: ${removed}`);
}
