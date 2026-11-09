/**
 * Роутер API: единая точка входа /exec?action=…
 * Публичные GET и приватные данные-ответы кэшируются в CacheService по dataRevision
 * (TTL 300 c; рост ревизии сбрасывает кэш немедленно). Вход и приватные запросы —
 * POST application/x-www-form-urlencoded, токен передаётся в теле,
 * чтобы не вызывать CORS preflight.
 */
import {
  GALLERY_DEFAULT_LIMIT,
  GALLERY_MAX_LIMIT,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_SECONDS,
  PUBLIC_CACHE_TTL_SECONDS,
  REVISION_CACHE_KEY
} from "./Config";
import { ApiFailure, HttpEvent, ValidatedArchive } from "./Types";
import { jsonError, jsonInternalError, jsonOk, ResponseMeta } from "./Responses";
import { verifyFamilyPassword } from "./Auth";
import { createSession, isSessionValid, revokeSession } from "./Sessions";
import { clearLoginFailures, exponentialLoginDelay, getLoginFailureCount, registerLoginFailure } from "./RateLimit";
import { loadFamilyMedia } from "./Media";
import { readDataRevision, readRawRecords } from "./SheetsRepository";
import { validateArchive } from "./Validation";
import { serializeGalleryPage, serializePerson, serializeTimeline, serializeTree } from "./PublicSerializer";
import { serializePrivateGallery, serializePrivatePerson, serializePrivateTimeline } from "./PrivateSerializer";
import { decodeCursor, isBlank, toInt, toText } from "./Util";

type Params = Record<string, string>;

const GET_ACTIONS = ["health", "public.tree", "public.person", "public.timeline", "public.gallery"];
const POST_ACTIONS = ["auth.login", "auth.status", "auth.logout", "private.person", "private.timeline", "private.gallery", "private.media"];

/**
 * Приватные данные-действия, кэшируемые по ревизии: содержимое не зависит от токена
 * (сессия проверяется при каждом запросе до отдачи кэша), поэтому чтение таблицы
 * и валидация выполняются один раз на TTL, а не при каждом открытии карточки.
 */
const PRIVATE_CACHED_ACTIONS = ["private.person", "private.timeline", "private.gallery", "private.media"];

export function handleGet(e: HttpEvent): GoogleAppsScript.Content.TextOutput {
  const action = toText(e.parameter.action);
  try {
    if (!GET_ACTIONS.includes(action)) {
      const wrongMethod = POST_ACTIONS.includes(action);
      return jsonError(
        400,
        wrongMethod ? "WRONG_METHOD" : "UNKNOWN_ACTION",
        wrongMethod ? "Это приватный action: используйте POST." : "Неизвестное действие API."
      );
    }
    if (action !== "health") {
      // Кэшируется пара {data, meta} — конверт пересобирается с новым requestId.
      const cached = readActionCache(action, e.parameter);
      if (cached) {
        const parsed = JSON.parse(cached) as { data: unknown; meta: ResponseMeta };
        return jsonOk(parsed.data, parsed.meta);
      }
    }
    const result = dispatchGet(action, e.parameter);
    if (action !== "health") {
      writeActionCache(action, e.parameter, { data: result.body, meta: result.meta });
    }
    return jsonOk(result.body, result.meta);
  } catch (error) {
    return failureToResponse(error);
  }
}

export function handlePost(e: HttpEvent): GoogleAppsScript.Content.TextOutput {
  const action = toText(e.parameter.action);
  try {
    if (!POST_ACTIONS.includes(action)) {
      const wrongMethod = GET_ACTIONS.includes(action);
      return jsonError(
        400,
        wrongMethod ? "WRONG_METHOD" : "UNKNOWN_ACTION",
        wrongMethod ? "Это публичный action: используйте GET." : "Неизвестное действие API."
      );
    }
    return dispatchPost(action, e.parameter);
  } catch (error) {
    return failureToResponse(error);
  }
}

// ---------------------------------------------------------------------------
// Публичные обработчики
// ---------------------------------------------------------------------------

function dispatchGet(action: string, params: Params): { body: unknown; meta: ResponseMeta } {
  if (action === "health") {
    const archive = loadArchive();
    return {
      body: { status: "ok", schemaVersion: archive.schemaVersion, dataRevision: archive.dataRevision },
      meta: { dataRevision: archive.dataRevision }
    };
  }
  const archive = loadArchive();
  const meta: ResponseMeta = { dataRevision: archive.dataRevision };
  if (action === "public.tree") {
    return { body: serializeTree(archive), meta };
  }
  if (action === "public.person") {
    const id = requirePersonId(params);
    return { body: serializePerson(archive, id), meta };
  }
  if (action === "public.timeline") {
    return { body: serializeTimeline(archive), meta };
  }
  // public.gallery
  const { offset, limit } = parsePagination(params);
  return { body: serializeGalleryPage(archive, offset, limit), meta };
}

// ---------------------------------------------------------------------------
// Приватные обработчики
// ---------------------------------------------------------------------------

function dispatchPost(action: string, params: Params): GoogleAppsScript.Content.TextOutput {
  if (action === "auth.login") return handleLogin(params);
  const token = toText(params.token);
  const validSession = isSessionValid(token);

  if (action === "auth.status") {
    if (!validSession) {
      return jsonError(401, "SESSION_INVALID", "Семейная сессия недействительна. Войдите ещё раз.");
    }
    return jsonOk({ valid: true }, currentMeta());
  }
  if (action === "auth.logout") {
    // Идемпотентно: даже без валидной сессии отвечаем 200.
    if (token) revokeSession(token);
    return jsonOk({ loggedOut: true }, currentMeta());
  }

  if (!validSession) {
    return jsonError(401, "SESSION_INVALID", "Семейная сессия недействительна. Войдите ещё раз.");
  }

  // Кэш приватных ответов: ключ по dataRevision (без токена — сессия уже проверена
  // выше, содержимое одинаково для всех семейных сессий). Правка таблицы или меню
  // «Обновить публичный кэш» поднимают ревизию — кэш сбрасывается сам.
  const useCache = PRIVATE_CACHED_ACTIONS.includes(action);
  if (useCache) {
    const cached = readActionCache(action, params);
    if (cached) {
      const parsed = JSON.parse(cached) as { data: unknown; meta: ResponseMeta };
      return jsonOk(parsed.data, parsed.meta);
    }
  }

  const archive = loadArchive();
  const meta: ResponseMeta = { dataRevision: archive.dataRevision };
  let body: object;
  if (action === "private.person") {
    const id = requirePersonId(params);
    body = serializePrivatePerson(archive, id) as object;
  } else if (action === "private.timeline") {
    body = serializePrivateTimeline(archive) as object;
  } else if (action === "private.gallery") {
    body = serializePrivateGallery(archive) as object;
  } else {
    // private.media: байты DRIVE-файлов (>100 КБ) в кэш не кладём — только ссылки.
    body = loadFamilyMedia(archive, toText(params.id)) as object;
  }
  if (useCache && !("base64" in body)) {
    writeActionCache(action, params, { data: body, meta });
  }
  return jsonOk(body, meta);
}

function handleLogin(params: Params): GoogleAppsScript.Content.TextOutput {
  const password = toText(params.password);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return jsonError(429, "RATE_LIMITED", "Сервер занят обработкой входа. Повторите через минуту.", { retryable: true, retryAfterSeconds: 60 });
  }
  try {
    // Глобальный предохранитель перебора до проверки пароля (IP в Apps Script недоступен).
    if (getLoginFailureCount() >= LOGIN_MAX_FAILURES) {
      return jsonError(429, "RATE_LIMITED", "Слишком много неудачных попыток входа. Подождите перед повтором.", {
        retryable: true,
        retryAfterSeconds: LOGIN_WINDOW_SECONDS
      });
    }
    if (isBlank(password) || !verifyFamilyPassword(password)) {
      const failure = registerLoginFailure();
      exponentialLoginDelay(failure.count);
      return jsonError(401, "INVALID_CREDENTIALS", "Неверный семейный пароль.");
    }
    clearLoginFailures();
    const session = createSession();
    return jsonOk({ token: session.token, createdAt: session.createdAt }, currentMeta());
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Общие помощники
// ---------------------------------------------------------------------------

function requirePersonId(params: Params): string {
  const id = toText(params.id);
  if (!id || !/^p_\d+$/.test(id)) {
    throw new ApiFailure(400, "BAD_PERSON_ID", "Некорректный personId.");
  }
  return id;
}

function parsePagination(params: Params): { offset: number; limit: number } {
  let offset = 0;
  const cursor = toText(params.cursor);
  if (cursor) {
    const decoded = decodeCursor<{ o?: number; r?: string }>(cursor);
    if (!decoded || typeof decoded.o !== "number" || decoded.o < 0) {
      throw new ApiFailure(400, "BAD_CURSOR", "Некорректный курсор пагинации.");
    }
    offset = decoded.o;
  }
  const limit = Math.min(Math.max(toInt(params.limit, GALLERY_DEFAULT_LIMIT), 1), GALLERY_MAX_LIMIT);
  return { offset, limit };
}

function loadArchive(): ValidatedArchive {
  const raw = readRawRecords();
  if (raw.schemaErrors.length > 0) {
    // Серьёзная ошибка схемы: общая ошибка без содержимого строк.
    throw new ApiFailure(500, "SCHEMA_ERROR", "Структура таблицы архива нарушена. Проверьте вкладки и заголовки.");
  }
  return validateArchive(raw);
}

function currentMeta(): ResponseMeta {
  try {
    return { dataRevision: readDataRevision() };
  } catch {
    return { dataRevision: "1" };
  }
}

function cacheKey(action: string, params: Params, revision: string): string {
  const extra =
    action === "public.person" || action === "private.person" || action === "private.media"
      ? toText(params.id)
      : action === "public.gallery"
        ? `${toText(params.cursor)}|${toText(params.limit)}`
        : "";
  return `v1:${revision}:${action}:${extra}`;
}

function readActionCache(action: string, params: Params): string | null {
  const revision = cachedRevision();
  if (!revision) return null;
  return CacheService.getScriptCache().get(cacheKey(action, params, revision));
}

function writeActionCache(action: string, params: Params, payload: { data: unknown; meta: ResponseMeta }): void {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(cacheKey(action, params, payload.meta.dataRevision), JSON.stringify(payload), PUBLIC_CACHE_TTL_SECONDS);
  } catch {
    // Кэш не критичен (например, ответ больше лимита CacheService — просто не кэшируем).
  }
}

/** Ревизия для ключей кэша: короткий кэш поверх дешёвого чтения Settings. */
function cachedRevision(): string | null {
  const cache = CacheService.getScriptCache();
  let revision = cache.get(REVISION_CACHE_KEY);
  if (!revision) {
    try {
      revision = readDataRevision();
      cache.put(REVISION_CACHE_KEY, revision, 60);
    } catch {
      return null;
    }
  }
  return revision;
}

function failureToResponse(error: unknown): GoogleAppsScript.Content.TextOutput {
  if (error instanceof ApiFailure) {
    return jsonError(error.status, error.code, error.message, { retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds });
  }
  // Лог без содержимого строк Sheets, токенов и приватных данных.
  console.error(`API error: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
  return jsonInternalError();
}
