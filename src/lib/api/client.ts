/**
 * HTTP-клиент Apps Script API.
 *
 * Правила транспорта (план, раздел 2):
 *  - публичные запросы: обычный GET без пользовательских заголовков;
 *  - вход/приватные запросы: POST application/x-www-form-urlencoded, токен в теле;
 *  - credentials: "omit", без no-cors/JSONP, без секретов во frontend;
 *  - HTML вместо JSON, redirect/CORS-сбой и таймаут → API_UNAVAILABLE.
 */
import type { ApiEnvelope } from "./types";

/** Безопасный доступ к env (в Node-тестах import.meta.env отсутствует). */
function resolveApiBase(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const raw = env?.PUBLIC_APPS_SCRIPT_URL ?? process.env.PUBLIC_APPS_SCRIPT_URL ?? "";
  return raw.trim().replace(/\/+$/, "");
}

const API_VERSION = "1";
const DEFAULT_TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: string, message: string, retryable = false, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** Человекочитаемое сообщение без технических деталей и приватных строк. */
  get userMessage(): string {
    if (this.code === "API_UNAVAILABLE") {
      return "Архив временно недоступен. Проверьте подключение и попробуйте ещё раз.";
    }
    if (this.code === "RATE_LIMITED") {
      const minutes = Math.max(1, Math.ceil((this.retryAfterSeconds ?? 300) / 60));
      return `Слишком много запросов. Подождите около ${minutes} мин.`;
    }
    if (this.code === "SCHEMA_ERROR") {
      return "Данные архива временно обрабатываются. Попробуйте обновить страницу позже.";
    }
    if (this.code === "SESSION_INVALID") {
      return "Семейная сессия недействительна. Войдите ещё раз.";
    }
    return this.message || "Не удалось получить данные архива.";
  }
}

export function isApiConfigured(): boolean {
  return resolveApiBase().length > 0;
}

export function apiBaseUrl(): string {
  return resolveApiBase();
}

interface RequestOptions {
  params?: Record<string, string>;
  body?: Record<string, string>;
  method: "GET" | "POST";
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(action: string, options: RequestOptions): Promise<T> {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new ApiError(0, "API_UNAVAILABLE", "Публичный URL API не настроен (PUBLIC_APPS_SCRIPT_URL).");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });

  let url = apiBase;
  if (options.method === "GET") {
    const query = new URLSearchParams({ action, ...(options.params ?? {}) });
    url = `${apiBase}?${query.toString()}`;
  }

  try {
    const response = await fetch(url, {
      method: options.method,
      credentials: "omit",
      cache: options.method === "POST" ? "no-store" : "default",
      headers:
        options.method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }
          : undefined,
      body:
        options.method === "POST"
          ? new URLSearchParams({ action, ...(options.body ?? {}) }).toString()
          : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let envelope: ApiEnvelope<T>;
    try {
      envelope = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      // Apps Script может отдать HTML-страницу входа или заглушку redirect.
      throw new ApiError(0, "API_UNAVAILABLE", "Ответ API не является JSON.");
    }
    if (typeof envelope !== "object" || envelope === null || typeof envelope.ok !== "boolean") {
      throw new ApiError(0, "API_UNAVAILABLE", "Некорректная структура ответа.");
    }
    if (envelope.apiVersion !== API_VERSION) {
      throw new ApiError(0, "API_UNAVAILABLE", `Неподдерживаемая версия API: ${envelope.apiVersion}.`);
    }
    if (envelope.ok === false) {
      throw new ApiError(
        envelope.error.status,
        envelope.error.code,
        envelope.error.message,
        envelope.error.retryable,
        envelope.error.retryAfterSeconds
      );
    }
    return envelope.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "API_UNAVAILABLE", "Превышено время ожидания ответа архива.");
    }
    throw new ApiError(0, "API_UNAVAILABLE", "Сеть недоступна или CORS-ошибка.");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}

export function apiGet<T>(action: string, params?: Record<string, string>, timeoutMs?: number, signal?: AbortSignal): Promise<T> {
  return request<T>(action, { method: "GET", params, timeoutMs, signal });
}

export function apiPost<T>(action: string, body?: Record<string, string>, timeoutMs?: number, signal?: AbortSignal): Promise<T> {
  return request<T>(action, { method: "POST", body, timeoutMs, signal });
}

/** Курсор пагинации: base64url JSON {o: offset} (совместим с decodeCursor сервера). */
export function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ o: offset })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
