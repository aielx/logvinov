/**
 * Постоянные семейные сессии.
 * Хранится только SHA-256-хеш токена + дата создания + AUTH_EPOCH.
 * CacheService не используется: его записи живут меньше сессии.
 */
import { PROP } from "./Config";
import { currentAuthEpoch } from "./Auth";
import { nowIso, randomToken, sha256Hex } from "./Util";

interface SessionRecord {
  created: string;
  epoch: number;
}

function sessionKey(token: string): string {
  return `${PROP.SESSION_PREFIX}${sha256Hex(token)}`;
}

/** Создание сессии для свежесгенерированного токена. Возвращает сам токен (клиенту). */
export function createSession(): { token: string; createdAt: string } {
  const token = randomToken();
  const record: SessionRecord = { created: nowIso(), epoch: currentAuthEpoch() };
  PropertiesService.getScriptProperties().setProperty(sessionKey(token), JSON.stringify(record));
  cleanupStaleSessions();
  return { token, createdAt: record.created };
}

/** Действительность токена: запись существует и её эпоха совпадает с текущей. */
export function isSessionValid(token: string): boolean {
  if (!token || token.length < 32) return false;
  const raw = PropertiesService.getScriptProperties().getProperty(sessionKey(token));
  if (!raw) return false;
  try {
    const record = JSON.parse(raw) as SessionRecord;
    return record.epoch === currentAuthEpoch();
  } catch {
    return false;
  }
}

/** Отзыв конкретной сессии (logout). Идемпотентен. */
export function revokeSession(token: string): void {
  if (!token) return;
  PropertiesService.getScriptProperties().deleteProperty(sessionKey(token));
}

/** Удаление записей прежних AUTH_EPOCH, чтобы не расходовать квоту свойств. */
export function cleanupStaleSessions(): number {
  const props = PropertiesService.getScriptProperties();
  const epoch = currentAuthEpoch();
  const keys = props.getKeys();
  let removed = 0;
  keys.forEach((key) => {
    if (key.indexOf(PROP.SESSION_PREFIX) !== 0) return;
    const raw = props.getProperty(key);
    if (!raw) return;
    try {
      const record = JSON.parse(raw) as SessionRecord;
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

/** Число активных сессий — только для закрытой admin-функции. */
export function countSessions(): number {
  return PropertiesService.getScriptProperties()
    .getKeys()
    .filter((key) => key.indexOf(PROP.SESSION_PREFIX) === 0).length;
}
