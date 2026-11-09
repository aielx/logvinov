/**
 * Семейный вход/выход и синхронизация состояния сессии на всех страницах.
 * Сервер — единственный источник правды о сессии; локально хранится только токен.
 */
import { ApiError } from "../lib/api/client";
import { checkSession, clearToken, getToken, login, revokeSessionOnServer } from "../lib/auth/session";
import { store, STORE_EVENTS } from "../lib/state/archive-store";
import { showToast } from "./notify";

export function isFamilyMode(): boolean {
  return store.familyMode;
}

export function applyFamilyUi(family: boolean): void {
  document.body.classList.toggle("is-private", family);
  document.querySelectorAll<HTMLElement>("[data-private-status]").forEach((element) => {
    element.textContent = family ? "Семейный режим" : "Публичная версия";
  });
  document.querySelectorAll<HTMLElement>("[data-leave-private]").forEach((button) => {
    button.hidden = !family;
  });
  document.querySelectorAll<HTMLElement>(".family-mode-button").forEach((button) => {
    button.hidden = family;
  });
  document.querySelectorAll<HTMLElement>(".header-access .access-label").forEach((label) => {
    label.textContent = family ? "Семейный режим" : "Для семьи";
  });
}

export async function tryLogin(password: string): Promise<void> {
  await login(password);
  store.enterFamily();
  showToast("Семейный режим включён: открыты подробные карточки живых родственников.");
}

/**
 * Обработка 401 SESSION_INVALID в любом приватном запросе:
 * полная локальная очистка и предложение повторного входа.
 */
export function handleSessionInvalid(): void {
  if (!getToken() && !store.familyMode) return;
  clearToken();
  store.resetPrivate();
  showToast("Семейная сессия недействительна. Показана публичная версия.");
}

/** Выход: локальная очистка всегда, серверный отзыв — best-effort. */
export async function logout(): Promise<void> {
  clearToken();
  store.resetPrivate();
  document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((dialog) => dialog.close());
  showToast("Семейный режим завершён. Показана публичная версия архива.");
  await revokeSessionOnServer();
}

/** Тихая проверка сохранённого токена при загрузке страницы. */
export async function restoreSessionOnLoad(): Promise<boolean> {
  if (!getToken()) return false;
  const valid = await checkSession();
  if (valid) {
    store.enterFamily();
  }
  return valid;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function initFamilyStoreSync(): void {
  store.addEventListener(STORE_EVENTS.FAMILY_CHANGE, () => applyFamilyUi(store.familyMode));
  store.addEventListener(STORE_EVENTS.RESET_PRIVATE, () => applyFamilyUi(false));
  applyFamilyUi(store.familyMode);
}
