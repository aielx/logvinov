/**
 * Этот файл — для копирования в веб-редактор Google Apps Script.
 * НЕ копируйте apps-script/src/*.ts: это TypeScript с import-инструкциями.
 * Сгенерировано автоматически: npm run gen:gs.
 */
function sessionKey(token) {
  return `${PROP.SESSION_PREFIX}${sha256Hex(token)}`;
}
function createSession() {
  const token = randomToken();
  const record = { created: nowIso(), epoch: currentAuthEpoch() };
  PropertiesService.getScriptProperties().setProperty(sessionKey(token), JSON.stringify(record));
  cleanupStaleSessions();
  return { token, createdAt: record.created };
}
function isSessionValid(token) {
  if (!token || token.length < 32) return false;
  const raw = PropertiesService.getScriptProperties().getProperty(sessionKey(token));
  if (!raw) return false;
  try {
    const record = JSON.parse(raw);
    return record.epoch === currentAuthEpoch();
  } catch {
    return false;
  }
}
function revokeSession(token) {
  if (!token) return;
  PropertiesService.getScriptProperties().deleteProperty(sessionKey(token));
}
function cleanupStaleSessions() {
  const props = PropertiesService.getScriptProperties();
  const epoch = currentAuthEpoch();
  const keys = props.getKeys();
  let removed = 0;
  keys.forEach((key) => {
    if (key.indexOf(PROP.SESSION_PREFIX) !== 0) return;
    const raw = props.getProperty(key);
    if (!raw) return;
    try {
      const record = JSON.parse(raw);
      if (record.epoch < epoch) {
        props.deleteProperty(key);
        removed += 1;
      }
    } catch {
      props.deleteProperty(key);
      removed += 1;
    }
  });
  return removed;
}
function countSessions() {
  return PropertiesService.getScriptProperties().getKeys().filter((key) => key.indexOf(PROP.SESSION_PREFIX) === 0).length;
}

