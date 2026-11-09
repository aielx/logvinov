/**
 * Пароль семьи: PBKDF2-HMAC-SHA256, соль и хеш в Script Properties.
 * Исходный пароль на сервере не хранится; проверка — только здесь, в Apps Script.
 */
import { PROP, PASSWORD_ITERATIONS, MIN_FAMILY_PASSWORD_LENGTH } from "./Config";
import { ApiFailure } from "./Types";
import { bytesToHex, constantTimeEqualHex, hexToBytes, hmacSha256Bytes } from "./Util";

/**
 * PBKDF2-HMAC-SHA256, один блок dkLen=32 байта (RFC 8018).
 * U1 = PRF(password, salt || INT(32..0)); Ui = PRF(password, U(i-1)); dk = XOR(Ui).
 */
export function pbkdf2Sha256(password: string, saltHex: string, iterations: number): string {
  if (iterations < 1) throw new ApiFailure(500, "INTERNAL_ERROR", "Некорректное число итераций");
  const passwordBytes = Array.from(Utilities.newBlob(password).getBytes()).map((b: number) => (b < 0 ? b + 256 : b));
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

function readAuthConfig(): { hash: string; salt: string; epoch: number } {
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty(PROP.PASSWORD_HASH);
  const salt = props.getProperty(PROP.PASSWORD_SALT);
  if (!hash || !salt) {
    throw new ApiFailure(500, "AUTH_NOT_CONFIGURED", "Семейный пароль не настроен. Запустите setFamilyPassword.");
  }
  return { hash, salt, epoch: Number(props.getProperty(PROP.AUTH_EPOCH) || "0") };
}

export function currentAuthEpoch(): number {
  return Number(PropertiesService.getScriptProperties().getProperty(PROP.AUTH_EPOCH) || "0");
}

/** Проверка пароля. Вызывать под LockService (см. Api). */
export function verifyFamilyPassword(password: string): boolean {
  const config = readAuthConfig();
  const candidate = pbkdf2Sha256(password, config.salt, PASSWORD_ITERATIONS);
  return constantTimeEqualHex(candidate, config.hash);
}

/** Настройка нового пароля: новая соль, рост AUTH_EPOCH — все прежние сессии отзываются. */
export function setFamilyPassword(password: string): void {
  if (password.length < MIN_FAMILY_PASSWORD_LENGTH) {
    throw new ApiFailure(400, "WEAK_PASSWORD", `Пароль должен быть не короче ${MIN_FAMILY_PASSWORD_LENGTH} символов.`);
  }
  const props = PropertiesService.getScriptProperties();
  const saltBytes = Array.from(Utilities.newBlob(Utilities.getUuid() + Utilities.getUuid()).getBytes())
    .slice(0, 16)
    .map((b: number) => (b < 0 ? b + 256 : b));
  const salt = bytesToHex(saltBytes);
  const hash = pbkdf2Sha256(password, salt, PASSWORD_ITERATIONS);
  const nextEpoch = currentAuthEpoch() + 1;
  props.setProperty(PROP.PASSWORD_SALT, salt);
  props.setProperty(PROP.PASSWORD_HASH, hash);
  props.setProperty(PROP.AUTH_EPOCH, String(nextEpoch));
}

/** Глобальный отзыв всех сессий без смены пароля. */
export function revokeAllSessionsByEpoch(): number {
  const props = PropertiesService.getScriptProperties();
  const nextEpoch = currentAuthEpoch() + 1;
  props.setProperty(PROP.AUTH_EPOCH, String(nextEpoch));
  // Записи прежних эпох удаляются немедленно, чтобы не расходовать квоту Script Properties.
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
