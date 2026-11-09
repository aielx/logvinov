/**
 * Интеграционные тесты роутера API (схема v2): тот же путь, что и реальный Web App,
 * с подменёнными Sheets/Drive/Properties. Прогоняется npm run test:server.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { handleGet, handlePost } from "../src/Api";
import { setFamilyPassword } from "../src/Auth";
import { addMockDriveFile, resetMockState, setMockSheets } from "./globals-mock";
import { demoSheetValues, CANARY_STRINGS } from "./fixture";

const FAMILY_PASSWORD = "тестовый-семейный-пароль-2025";

interface Envelope {
  ok: boolean;
  apiVersion: string;
  requestId: string;
  data?: unknown;
  error?: { status: number; code: string; message: string; retryable?: boolean; retryAfterSeconds?: number };
  meta?: { dataRevision: string; generatedAt: string };
}

function parse(output: { text: string }): Envelope {
  return JSON.parse(output.text) as Envelope;
}

function get(action: string, params: Record<string, string> = {}): Envelope {
  return parse(handleGet({ parameter: { action, ...params } }) as unknown as { text: string });
}

function post(action: string, params: Record<string, string> = {}): Envelope {
  return parse(handlePost({ parameter: { action, ...params } }) as unknown as { text: string });
}

beforeEach(() => {
  resetMockState();
  setMockSheets(demoSheetValues());
  setFamilyPassword(FAMILY_PASSWORD);
  addMockDriveFile({
    id: "CANARYDRIVEFILEID0001",
    name: "family-photo.png",
    mimeType: "image/png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]
  });
});

describe("Конверт ответа", () => {
  it("успех: ok/apiVersion/requestId/data/meta", () => {
    const response = get("health");
    expect(response.ok).toBe(true);
    expect(response.apiVersion).toBe("1");
    expect(response.requestId).toBeTruthy();
    expect(response.data).toMatchObject({ status: "ok", schemaVersion: "2" });
  });

  it("неизвестный action и подмена метода", () => {
    expect(get("hack").error).toMatchObject({ status: 400, code: "UNKNOWN_ACTION" });
    expect(get("auth.login").error).toMatchObject({ status: 400, code: "WRONG_METHOD" });
    expect(post("public.tree").error).toMatchObject({ status: 400, code: "WRONG_METHOD" });
  });
});

describe("Публичные GET", () => {
  it("public.tree: 10 человек, 3 ветви, поколения", () => {
    const tree = get("public.tree").data as { people: unknown[]; branches: unknown[] };
    expect(tree.people.length).toBe(10);
    expect(tree.branches.length).toBe(3);
  });

  it("public.person: неверный id, 404, семейная карточка живого/умершего", () => {
    expect(get("public.person", { id: "evil" }).error).toMatchObject({ status: 400, code: "BAD_PERSON_ID" });
    expect(get("public.person", { id: "p_9999" }).error).toMatchObject({ status: 404, code: "PERSON_NOT_FOUND" });
    expect(get("public.person", { id: "p_0008" }).error).toMatchObject({ status: 401, code: "FAMILY_ACCESS_REQUIRED" });
    expect(get("public.person", { id: "p_0006" }).error).toMatchObject({ status: 401, code: "FAMILY_ACCESS_REQUIRED" });
    expect(get("public.person", { id: "p_0001" }).ok).toBe(true);
  });

  it("includePrivate=true не меняет права", () => {
    const response = get("public.person", { id: "p_0008", includePrivate: "true" });
    expect(response.error).toMatchObject({ status: 401, code: "FAMILY_ACCESS_REQUIRED" });
  });

  it("canary-строки отсутствуют во всех публичных ответах", () => {
    const payloads = [
      JSON.stringify(get("public.tree")),
      JSON.stringify(get("public.person", { id: "p_0001" })),
      JSON.stringify(get("public.timeline")),
      JSON.stringify(get("public.gallery", { limit: "60" })),
      JSON.stringify(get("public.gallery", { cursor: "###", limit: "10" }))
    ].join("\n");
    CANARY_STRINGS.forEach((canary) => expect(payloads).not.toContain(canary));
  });

  it("public.gallery: лимит и битый курсор", () => {
    const page = get("public.gallery", { limit: "3" }).data as { items: unknown[]; nextCursorOffset: number };
    expect(page.items.length).toBe(3);
    expect(get("public.gallery", { cursor: "!!", limit: "3" }).error).toMatchObject({ status: 400, code: "BAD_CURSOR" });
    expect(get("public.gallery", { limit: "9999" }).ok).toBe(true);
  });
});

describe("Вход и приватные запросы", () => {
  it("неверный пароль → 401, верный → токен ≥256 бит", () => {
    expect(post("auth.login", { password: "не-тот-пароль" }).error).toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
    const login = post("auth.login", { password: FAMILY_PASSWORD });
    expect(login.ok).toBe(true);
    expect(String((login.data as { token: string }).token).length).toBeGreaterThanOrEqual(64);
  });

  it("приватный запрос без токена и с чужим токеном → 401", () => {
    expect(post("private.person", { id: "p_0008" }).error).toMatchObject({ status: 401, code: "SESSION_INVALID" });
    expect(post("private.person", { id: "p_0008", token: "f".repeat(64) }).error).toMatchObject({ status: 401, code: "SESSION_INVALID" });
  });

  it("private.person/timeline/gallery с валидной сессией содержат семейные данные", () => {
    const token = (post("auth.login", { password: FAMILY_PASSWORD }).data as { token: string }).token;
    const person = post("private.person", { id: "p_0008", token }).data as Record<string, unknown>;
    expect(String(person.bio)).toContain("CANARY p0008");
    const timeline = post("private.timeline", { token }).data as { events: Array<{ eventId: string }> };
    expect(timeline.events.some((e) => e.eventId === "e_0013")).toBe(true);
    const gallery = post("private.gallery", { token }).data as { items: unknown[] };
    expect(gallery.items.length).toBe(2);
  });

  it("logout отзывает только текущую сессию и идемпотентен", () => {
    const tokenA = (post("auth.login", { password: FAMILY_PASSWORD }).data as { token: string }).token;
    const tokenB = (post("auth.login", { password: FAMILY_PASSWORD }).data as { token: string }).token;
    expect(post("auth.logout", { token: tokenA }).ok).toBe(true);
    expect(post("auth.logout", { token: tokenA }).ok).toBe(true);
    expect(post("private.person", { id: "p_0008", token: tokenA }).error).toMatchObject({ code: "SESSION_INVALID" });
    expect(post("private.person", { id: "p_0008", token: tokenB }).ok).toBe(true);
  });

  it("auth.status проверяет сохранённый токен", () => {
    const token = (post("auth.login", { password: FAMILY_PASSWORD }).data as { token: string }).token;
    expect(post("auth.status", { token }).ok).toBe(true);
    expect(post("auth.status", { token: "0".repeat(64) }).error).toMatchObject({ code: "SESSION_INVALID" });
  });

  it("private.media: DRIVE-файл по mediaId; driveFileId как id не работает", () => {
    const token = (post("auth.login", { password: FAMILY_PASSWORD }).data as { token: string }).token;
    const media = post("private.media", { id: "m_0010", token }).data as Record<string, unknown>;
    expect(media.storage).toBe("DRIVE");
    expect(media.base64).toBeTruthy();
    expect(media.mimeType).toBe("image/png");
    expect(media.driveFileId).toBeUndefined();
    expect(post("private.media", { id: "CANARYDRIVEFILEID0001", token }).error).toMatchObject({ status: 400, code: "BAD_MEDIA_ID" });
    expect(post("private.media", { id: "m_0010" }).error).toMatchObject({ status: 401, code: "SESSION_INVALID" });
    expect(post("private.media", { id: "m_0001", token }).error).toMatchObject({ status: 404, code: "MEDIA_NOT_FOUND" });
  });

  it("приватный mediaId через GET запрещён (WRONG_METHOD)", () => {
    expect(get("private.media", { id: "m_0010" }).error).toMatchObject({ status: 400, code: "WRONG_METHOD" });
  });
});

describe("Ошибки схемы", () => {
  it("отсутствие вкладки «Люди» → общая 500 без содержимого", () => {
    const broken = demoSheetValues();
    delete broken["Люди"];
    setMockSheets(broken);
    const response = get("public.tree");
    expect(response.error).toMatchObject({ status: 500, code: "SCHEMA_ERROR" });
    expect(JSON.stringify(response)).not.toContain("Люди");
  });
});
