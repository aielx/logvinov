/**
 * Семейная сессия на клиенте.
 * В localStorage хранится ТОЛЬКО токен (ключ familyArchive.token);
 * приватные данные и медиа живут исключительно в памяти текущей страницы.
 */
import { apiPost, ApiError } from "../api/client";
import type { LoginResult } from "../api/types";

const TOKEN_KEY = "familyArchive.token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage может быть недоступен (приватный режим): сессия живёт до перезагрузки.
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Игнорируем.
  }
}

export async function login(password: string): Promise<LoginResult> {
  const result = await apiPost<LoginResult>("auth.login", { password }, 15_000);
  setToken(result.token);
  return result;
}

/** Проверка сохранённого токена; false — токен отсутствует или отозван. */
export async function checkSession(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    await apiPost<{ valid: boolean }>("auth.status", { token }, 10_000);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
      return false;
    }
    // API недоступен: считаем сессию неподтверждённой, но токен не отзываем локально
    // (сервер всё равно проверит его при первом приватном запросе).
    return false;
  }
}

/** Серверный отзыв — best-effort; локальная очистка выполняется независимо от ответа. */
export async function revokeSessionOnServer(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    await apiPost("auth.logout", { token }, 8_000);
  } catch {
    // Локальная очистка важнее ответа сервера.
  }
}
