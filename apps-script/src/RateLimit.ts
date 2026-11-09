/**
 * Глобальные счётчики частоты через CacheService + LockService.
 * Apps Script не предоставляет надёжного IP клиента в Web App —
 * лимиты глобальные (ограничение зафиксировано в docs/threat-model.md).
 */
import { LOGIN_DELAY_MAX_MS, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS } from "./Config";

function windowStart(now: number, windowSeconds: number): number {
  return Math.floor(now / 1000 / windowSeconds) * windowSeconds;
}

function counterKey(bucket: string, windowSeconds: number): string {
  const seconds = Math.floor(Date.now() / 1000);
  return `rl:${bucket}:${windowStart(seconds * 1000, windowSeconds)}`;
}

/**
 * Атомарный (под script-lock) инкремент счётчика.
 * Возвращает false, если лимит в текущем окне уже исчерпан.
 */
export function tryIncrement(bucket: string, max: number, windowSeconds: number): boolean {
  const lock = LockService.getScriptLock();
  const locked = lock.tryLock(2000);
  if (!locked) return true; // блокировка не критична: пропускаем, защита остаётся статистической
  try {
    const cache = CacheService.getScriptCache();
    const key = counterKey(bucket, windowSeconds);
    const current = Number(cache.get(key) || "0");
    if (current >= max) return false;
    cache.put(key, String(current + 1), windowSeconds + 60);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Неудачная попытка входа: блокировка на LOGIN_MAX_FAILURES в окне LOGIN_WINDOW_SECONDS. */
export function registerLoginFailure(): { count: number; blocked: boolean; retryAfterSeconds: number } {
  const failures = incrementProtected("login-failures", LOGIN_WINDOW_SECONDS);
  const windowEnd = (windowStart(Date.now(), LOGIN_WINDOW_SECONDS) + LOGIN_WINDOW_SECONDS) * 1000;
  const retryAfter = Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000));
  return { count: failures, blocked: failures >= LOGIN_MAX_FAILURES, retryAfterSeconds: retryAfter };
}

export function clearLoginFailures(): void {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    CacheService.getScriptCache().remove(counterKey("login-failures", LOGIN_WINDOW_SECONDS));
  } finally {
    lock.releaseLock();
  }
}

/** Текущее число неудачных попыток в окне (для экспоненциальной задержки). */
export function getLoginFailureCount(): number {
  return Number(CacheService.getScriptCache().get(counterKey("login-failures", LOGIN_WINDOW_SECONDS)) || "0");
}

/** Экспоненциальная задержка ответа на повторные ошибки пароля (онлайн-перебор). */
export function exponentialLoginDelay(failureCount: number): void {
  if (failureCount <= 1) return;
  const delay = Math.min(LOGIN_DELAY_MAX_MS, 200 * Math.pow(2, Math.min(failureCount - 1, 6)));
  if (delay > 0) Utilities.sleep(delay);
}

function incrementProtected(bucket: string, windowSeconds: number): number {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return 1;
  try {
    const cache = CacheService.getScriptCache();
    const key = counterKey(bucket, windowSeconds);
    const current = Number(cache.get(key) || "0") + 1;
    cache.put(key, String(current), windowSeconds + 60);
    return current;
  } finally {
    lock.releaseLock();
  }
}
