const GET_ACTIONS = ["health", "public.tree", "public.person", "public.timeline", "public.gallery"];
const POST_ACTIONS = ["auth.login", "auth.status", "auth.logout", "private.person", "private.timeline", "private.gallery", "private.media"];
const PRIVATE_CACHED_ACTIONS = ["private.person", "private.timeline", "private.gallery", "private.media"];
function handleGet(e) {
  const action = toText(e.parameter.action);
  try {
    if (!GET_ACTIONS.includes(action)) {
      const wrongMethod = POST_ACTIONS.includes(action);
      return jsonError(
        400,
        wrongMethod ? "WRONG_METHOD" : "UNKNOWN_ACTION",
        wrongMethod ? "\u042D\u0442\u043E \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u044B\u0439 action: \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 POST." : "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 API."
      );
    }
    if (action !== "health") {
      const cached = readActionCache(action, e.parameter);
      if (cached) {
        const parsed = JSON.parse(cached);
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
function handlePost(e) {
  const action = toText(e.parameter.action);
  try {
    if (!POST_ACTIONS.includes(action)) {
      const wrongMethod = GET_ACTIONS.includes(action);
      return jsonError(
        400,
        wrongMethod ? "WRONG_METHOD" : "UNKNOWN_ACTION",
        wrongMethod ? "\u042D\u0442\u043E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 action: \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 GET." : "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 API."
      );
    }
    return dispatchPost(action, e.parameter);
  } catch (error) {
    return failureToResponse(error);
  }
}
function dispatchGet(action, params) {
  if (action === "health") {
    const archive2 = loadArchive();
    return {
      body: { status: "ok", schemaVersion: archive2.schemaVersion, dataRevision: archive2.dataRevision },
      meta: { dataRevision: archive2.dataRevision }
    };
  }
  const archive = loadArchive();
  const meta = { dataRevision: archive.dataRevision };
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
  const { offset, limit } = parsePagination(params);
  return { body: serializeGalleryPage(archive, offset, limit), meta };
}
function dispatchPost(action, params) {
  if (action === "auth.login") return handleLogin(params);
  const token = toText(params.token);
  const validSession = isSessionValid(token);
  if (action === "auth.status") {
    if (!validSession) {
      return jsonError(401, "SESSION_INVALID", "\u0421\u0435\u043C\u0435\u0439\u043D\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430. \u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.");
    }
    return jsonOk({ valid: true }, currentMeta());
  }
  if (action === "auth.logout") {
    if (token) revokeSession(token);
    return jsonOk({ loggedOut: true }, currentMeta());
  }
  if (!validSession) {
    return jsonError(401, "SESSION_INVALID", "\u0421\u0435\u043C\u0435\u0439\u043D\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430. \u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.");
  }
  const useCache = PRIVATE_CACHED_ACTIONS.includes(action);
  if (useCache) {
    const cached = readActionCache(action, params);
    if (cached) {
      const parsed = JSON.parse(cached);
      return jsonOk(parsed.data, parsed.meta);
    }
  }
  const archive = loadArchive();
  const meta = { dataRevision: archive.dataRevision };
  let body;
  if (action === "private.person") {
    const id = requirePersonId(params);
    body = serializePrivatePerson(archive, id);
  } else if (action === "private.timeline") {
    body = serializePrivateTimeline(archive);
  } else if (action === "private.gallery") {
    body = serializePrivateGallery(archive);
  } else {
    body = loadFamilyMedia(archive, toText(params.id));
  }
  if (useCache && !("base64" in body)) {
    writeActionCache(action, params, { data: body, meta });
  }
  return jsonOk(body, meta);
}
function handleLogin(params) {
  const password = toText(params.password);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5e3)) {
    return jsonError(429, "RATE_LIMITED", "\u0421\u0435\u0440\u0432\u0435\u0440 \u0437\u0430\u043D\u044F\u0442 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u043E\u0439 \u0432\u0445\u043E\u0434\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u043C\u0438\u043D\u0443\u0442\u0443.", { retryable: true, retryAfterSeconds: 60 });
  }
  try {
    if (getLoginFailureCount() >= LOGIN_MAX_FAILURES) {
      return jsonError(429, "RATE_LIMITED", "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043D\u0435\u0443\u0434\u0430\u0447\u043D\u044B\u0445 \u043F\u043E\u043F\u044B\u0442\u043E\u043A \u0432\u0445\u043E\u0434\u0430. \u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043F\u0435\u0440\u0435\u0434 \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u043C.", {
        retryable: true,
        retryAfterSeconds: LOGIN_WINDOW_SECONDS
      });
    }
    if (isBlank(password) || !verifyFamilyPassword(password)) {
      const failure = registerLoginFailure();
      exponentialLoginDelay(failure.count);
      return jsonError(401, "INVALID_CREDENTIALS", "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0441\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C.");
    }
    clearLoginFailures();
    const session = createSession();
    return jsonOk({ token: session.token, createdAt: session.createdAt }, currentMeta());
  } finally {
    lock.releaseLock();
  }
}
function requirePersonId(params) {
  const id = toText(params.id);
  if (!id || !/^p_\d+$/.test(id)) {
    throw new ApiFailure(400, "BAD_PERSON_ID", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 personId.");
  }
  return id;
}
function parsePagination(params) {
  let offset = 0;
  const cursor = toText(params.cursor);
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded || typeof decoded.o !== "number" || decoded.o < 0) {
      throw new ApiFailure(400, "BAD_CURSOR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043A\u0443\u0440\u0441\u043E\u0440 \u043F\u0430\u0433\u0438\u043D\u0430\u0446\u0438\u0438.");
    }
    offset = decoded.o;
  }
  const limit = Math.min(Math.max(toInt(params.limit, GALLERY_DEFAULT_LIMIT), 1), GALLERY_MAX_LIMIT);
  return { offset, limit };
}
function loadArchive() {
  const raw = readRawRecords();
  if (raw.schemaErrors.length > 0) {
    throw new ApiFailure(500, "SCHEMA_ERROR", "\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u0442\u0430\u0431\u043B\u0438\u0446\u044B \u0430\u0440\u0445\u0438\u0432\u0430 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 \u0438 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438.");
  }
  return validateArchive(raw);
}
function currentMeta() {
  try {
    return { dataRevision: readDataRevision() };
  } catch {
    return { dataRevision: "1" };
  }
}
function cacheKey(action, params, revision) {
  const extra = action === "public.person" || action === "private.person" || action === "private.media" ? toText(params.id) : action === "public.gallery" ? `${toText(params.cursor)}|${toText(params.limit)}` : "";
  return `v1:${revision}:${action}:${extra}`;
}
function readActionCache(action, params) {
  const revision = cachedRevision();
  if (!revision) return null;
  return CacheService.getScriptCache().get(cacheKey(action, params, revision));
}
function writeActionCache(action, params, payload) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(cacheKey(action, params, payload.meta.dataRevision), JSON.stringify(payload), PUBLIC_CACHE_TTL_SECONDS);
  } catch {
  }
}
function cachedRevision() {
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
function failureToResponse(error) {
  if (error instanceof ApiFailure) {
    return jsonError(error.status, error.code, error.message, { retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds });
  }
  console.error(`API error: ${String(error?.message ?? error).slice(0, 200)}`);
  return jsonInternalError();
}

