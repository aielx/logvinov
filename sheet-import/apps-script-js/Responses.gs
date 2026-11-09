function jsonOk(data, meta) {
  const body = {
    ok: true,
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
function jsonError(status, code, message, options = {}) {
  const body = {
    ok: false,
    apiVersion: API_VERSION,
    requestId: options.requestId ?? randomRequestId(),
    error: {
      status,
      code,
      message,
      retryable: options.retryable === true,
      ...options.retryAfterSeconds !== void 0 ? { retryAfterSeconds: options.retryAfterSeconds } : {}
    }
  };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
function jsonInternalError() {
  return jsonError(500, "INTERNAL_ERROR", "\u0412\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u044F\u044F \u043E\u0448\u0438\u0431\u043A\u0430 \u0430\u0440\u0445\u0438\u0432\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.");
}

