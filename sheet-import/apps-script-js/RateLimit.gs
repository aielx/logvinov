/**
 * Этот файл — для копирования в веб-редактор Google Apps Script.
 * НЕ копируйте apps-script/src/*.ts: это TypeScript с import-инструкциями.
 * Сгенерировано автоматически: npm run gen:gs.
 */
function windowStart(now, windowSeconds) {
  return Math.floor(now / 1e3 / windowSeconds) * windowSeconds;
}
function counterKey(bucket, windowSeconds) {
  const seconds = Math.floor(Date.now() / 1e3);
  return `rl:${bucket}:${windowStart(seconds * 1e3, windowSeconds)}`;
}
function tryIncrement(bucket, max, windowSeconds) {
  const lock = LockService.getScriptLock();
  const locked = lock.tryLock(2e3);
  if (!locked) return true;
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
function registerLoginFailure() {
  const failures = incrementProtected("login-failures", LOGIN_WINDOW_SECONDS);
  const windowEnd = (windowStart(Date.now(), LOGIN_WINDOW_SECONDS) + LOGIN_WINDOW_SECONDS) * 1e3;
  const retryAfter = Math.max(1, Math.ceil((windowEnd - Date.now()) / 1e3));
  return { count: failures, blocked: failures >= LOGIN_MAX_FAILURES, retryAfterSeconds: retryAfter };
}
function clearLoginFailures() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1e3)) return;
  try {
    CacheService.getScriptCache().remove(counterKey("login-failures", LOGIN_WINDOW_SECONDS));
  } finally {
    lock.releaseLock();
  }
}
function getLoginFailureCount() {
  return Number(CacheService.getScriptCache().get(counterKey("login-failures", LOGIN_WINDOW_SECONDS)) || "0");
}
function exponentialLoginDelay(failureCount) {
  if (failureCount <= 1) return;
  const delay = Math.min(LOGIN_DELAY_MAX_MS, 200 * Math.pow(2, Math.min(failureCount - 1, 6)));
  if (delay > 0) Utilities.sleep(delay);
}
function incrementProtected(bucket, windowSeconds) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1e3)) return 1;
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

