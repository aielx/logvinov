/**
 * Формирование JSON-конвертов через ContentService.
 * Apps Script не управляет настоящими HTTP-статусами — используются прикладные коды
 * (см. план, раздел 2 «Критические ограничения Apps Script»).
 */
import { API_VERSION } from "./Config";
import { nowIso, randomRequestId } from "./Util";

export interface ResponseMeta {
  dataRevision: string;
}

export function jsonOk(data: unknown, meta: ResponseMeta): GoogleAppsScript.Content.TextOutput {
  const body = {
    ok: true as const,
    apiVersion: API_VERSION,
    requestId: randomRequestId(),
    data,
    meta: {
      dataRevision: meta.dataRevision,
      generatedAt: nowIso()
    }
  };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

export interface ErrorOptions {
  retryable?: boolean;
  retryAfterSeconds?: number;
  requestId?: string;
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  options: ErrorOptions = {}
): GoogleAppsScript.Content.TextOutput {
  const body = {
    ok: false as const,
    apiVersion: API_VERSION,
    requestId: options.requestId ?? randomRequestId(),
    error: {
      status,
      code,
      message,
      retryable: options.retryable === true,
      ...(options.retryAfterSeconds !== undefined ? { retryAfterSeconds: options.retryAfterSeconds } : {})
    }
  };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/** Общая внутренняя ошибка без стека, строк Sheets, ID файлов и приватного содержимого. */
export function jsonInternalError(): GoogleAppsScript.Content.TextOutput {
  return jsonError(500, "INTERNAL_ERROR", "Внутренняя ошибка архива. Попробуйте позже.");
}
