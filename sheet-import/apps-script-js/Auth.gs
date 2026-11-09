/**
 * Этот файл — для копирования в веб-редактор Google Apps Script.
 * НЕ копируйте apps-script/src/*.ts: это TypeScript с import-инструкциями.
 * Сгенерировано автоматически: npm run gen:gs.
 */
function pbkdf2Sha256(password, saltHex, iterations) {
  if (iterations < 1) throw new ApiFailure(500, "INTERNAL_ERROR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0447\u0438\u0441\u043B\u043E \u0438\u0442\u0435\u0440\u0430\u0446\u0438\u0439");
  const passwordBytes = Array.from(Utilities.newBlob(password).getBytes()).map((b) => b < 0 ? b + 256 : b);
  const salt = hexToBytes(saltHex);
  const intBlock1 = salt.concat([0, 0, 0, 1]);
  let u = hmacSha256Bytes(intBlock1, passwordBytes);
  const dk = u.slice();
  for (let i = 1; i < iterations; i += 1) {
    u = hmacSha256Bytes(u, passwordBytes);
    for (let j = 0; j < dk.length; j += 1) {
      dk[j] ^= u[j];
    }
  }
  return bytesToHex(dk);
}
function readAuthConfig() {
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty(PROP.PASSWORD_HASH);
  const salt = props.getProperty(PROP.PASSWORD_SALT);
  if (!hash || !salt) {
    throw new ApiFailure(500, "AUTH_NOT_CONFIGURED", "\u0421\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D. \u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 setFamilyPassword.");
  }
  return { hash, salt, epoch: Number(props.getProperty(PROP.AUTH_EPOCH) || "0") };
}
function currentAuthEpoch() {
  return Number(PropertiesService.getScriptProperties().getProperty(PROP.AUTH_EPOCH) || "0");
}
function verifyFamilyPassword(password) {
  const config = readAuthConfig();
  const candidate = pbkdf2Sha256(password, config.salt, PASSWORD_ITERATIONS);
  return constantTimeEqualHex(candidate, config.hash);
}
function setFamilyPassword(password) {
  if (password.length < MIN_FAMILY_PASSWORD_LENGTH) {
    throw new ApiFailure(400, "WEAK_PASSWORD", `\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043A\u043E\u0440\u043E\u0447\u0435 ${MIN_FAMILY_PASSWORD_LENGTH} \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432.`);
  }
  const props = PropertiesService.getScriptProperties();
  const saltBytes = Array.from(Utilities.newBlob(Utilities.getUuid() + Utilities.getUuid()).getBytes()).slice(0, 16).map((b) => b < 0 ? b + 256 : b);
  const salt = bytesToHex(saltBytes);
  const hash = pbkdf2Sha256(password, salt, PASSWORD_ITERATIONS);
  const nextEpoch = currentAuthEpoch() + 1;
  props.setProperty(PROP.PASSWORD_SALT, salt);
  props.setProperty(PROP.PASSWORD_HASH, hash);
  props.setProperty(PROP.AUTH_EPOCH, String(nextEpoch));
}
function revokeAllSessionsByEpoch() {
  const props = PropertiesService.getScriptProperties();
  const nextEpoch = currentAuthEpoch() + 1;
  props.setProperty(PROP.AUTH_EPOCH, String(nextEpoch));
  const keys = props.getKeys();
  let removed = 0;
  keys.forEach((key) => {
    if (key.indexOf(PROP.SESSION_PREFIX) === 0) {
      props.deleteProperty(key);
      removed += 1;
    }
  });
  return removed;
}

