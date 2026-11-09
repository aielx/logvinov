import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiPost, encodeCursor } from "../../../src/lib/api/client";

const OK_ENVELOPE = JSON.stringify({
  ok: true,
  apiVersion: "1",
  requestId: "r1",
  data: { value: 42 },
  meta: { dataRevision: "1", generatedAt: "2026-01-01T00:00:00Z" }
});

function mockFetch(response: { status?: number; body: string } | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return new Response(response.body, { status: response.status ?? 200, headers: { "content-type": "application/json" } });
  });
}

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("API-клиент", () => {
  it("успешный конверт возвращает data", async () => {
    vi.stubGlobal("import.meta", import.meta);
    globalThis.fetch = mockFetch({ body: OK_ENVELOPE }) as unknown as typeof fetch;
    await expect(apiGet<{ value: number }>("health")).resolves.toEqual({ value: 42 });
  });

  it("HTML вместо JSON → API_UNAVAILABLE", async () => {
    globalThis.fetch = mockFetch({ body: "<html>login</html>" }) as unknown as typeof fetch;
    const error = await apiGet("public.tree").catch((error_) => error_);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("API_UNAVAILABLE");
  });

  it("прикладная ошибка переносит status/code/retryAfter", async () => {
    const body = JSON.stringify({
      ok: false,
      apiVersion: "1",
      requestId: "r2",
      error: { status: 429, code: "RATE_LIMITED", message: "Подождите", retryable: true, retryAfterSeconds: 900 }
    });
    globalThis.fetch = mockFetch({ body }) as unknown as typeof fetch;
    const error = await apiGet("auth.login").catch((error_) => error_);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).retryAfterSeconds).toBe(900);
    expect((error as ApiError).userMessage).toContain("мин");
  });

  it("неподдерживаемая версия API → API_UNAVAILABLE", async () => {
    const body = JSON.stringify({ ok: true, apiVersion: "2", requestId: "r", data: {}, meta: { dataRevision: "1", generatedAt: "" } });
    globalThis.fetch = mockFetch({ body }) as unknown as typeof fetch;
    const error = await apiGet("health").catch((error_) => error_);
    expect((error as ApiError).code).toBe("API_UNAVAILABLE");
  });

  it("сетевая ошибка → API_UNAVAILABLE, не ломает страницу", async () => {
    globalThis.fetch = mockFetch(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const error = await apiPost("auth.login", { password: "x" }).catch((error_) => error_);
    expect((error as ApiError).code).toBe("API_UNAVAILABLE");
  });

  it("таймаут отменяет запрос (AbortController)", async () => {
    globalThis.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;
    const error = await apiGet("public.tree", undefined, 50).catch((error_) => error_);
    expect((error as ApiError).code).toBe("API_UNAVAILABLE");
    expect((error as ApiError).message).toContain("время ожидания");
  });

  it("курсор пагинации совместим с серверным decodeCursor", () => {
    expect(encodeCursor(24)).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = JSON.parse(atob(encodeCursor(24)));
    expect(decoded).toEqual({ o: 24 });
  });
});
