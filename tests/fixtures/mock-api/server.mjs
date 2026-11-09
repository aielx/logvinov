/**
 * Локальный contract-mock Apps Script API для e2e-тестов Playwright.
 * Воспроизводит контракт (/exec?action=…) без Google: те же конверты, коды ошибок,
 * urlencoded POST, семейная сессия с токеном, private.media с PNG-байтами.
 *
 * Данные: tests/fixtures/mock-api/data.json (сгенерирован из демо-набора Apps Script).
 * Пароль: E2E_FAMILY_PASSWORD или "семейный-тест".
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

const PORT = Number(process.argv[2] ?? 8787);
const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(HERE, "data.json"), "utf8"));

const API_VERSION = "1";
const FAMILY_PASSWORD = process.env.E2E_FAMILY_PASSWORD ?? "семейный-тест";
const LOGIN_MAX_FAILURES = 5;
const sessions = new Set();
let loginFailures = 0;

function envelope(dataPayload) {
  return JSON.stringify({
    ok: true,
    apiVersion: API_VERSION,
    requestId: randomUUID(),
    data: dataPayload,
    meta: { dataRevision: "1", generatedAt: new Date().toISOString() }
  });
}

function failure(status, code, message, extra = {}) {
  return JSON.stringify({
    ok: false,
    apiVersion: API_VERSION,
    requestId: randomUUID(),
    error: { status, code, message, retryable: false, ...extra }
  });
}

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function personById(id) {
  return data.people.find((p) => p.personId === id);
}

function mediaById(id) {
  return data.media.find((m) => m.mediaId === id);
}

function avatarOf(person) {
  return person.avatar ?? null;
}

function personMini(id) {
  const person = personById(id);
  return person
    ? { personId: person.personId, displayName: person.displayName, years: person.years, isLiving: person.isLiving }
    : null;
}

function personCard(id) {
  const person = personById(id);
  const details = person; // в v2 текстовые поля лежат прямо в записи человека
  const relations = (ids, relation) => ids.map(personMini).filter(Boolean).map((mini) => ({ ...mini, relation }));
  return {
    personId: person.personId,
    displayName: person.displayName,
    years: person.years,
    generation: person.generation,
    branchId: person.branchId,
    branchLabel: data.branches.find((b) => b.branchId === person.branchId)?.label ?? null,
    bio: details.publicBio ?? "",
    birthPlace: details.publicBirthPlace ?? "",
    birth: person.birthDate ? { date: person.birthDate, precision: "YEAR", year: Number(person.birthDate) } : null,
    death: person.deathDate ? { date: person.deathDate, precision: "YEAR", year: Number(person.deathDate) } : null,
    avatar: avatarOf(person),
    relatives: [
      ...relations(person.parentIds, "parent"),
      ...relations(person.spouseIds, "spouse"),
      ...relations(person.childIds, "child")
    ],
    materials: data.personMedia
      .filter((link) => link.personId === id)
      .map((link) => mediaById(link.mediaId))
      .filter((media) => media && media.visibility === "PUBLIC")
      .map((media) => ({
        mediaId: media.mediaId,
        title: media.title,
        category: media.category,
        role: "GALLERY",
        dateDisplay: media.dateDisplay,
        altText: media.altText,
        caption: media.publicCaption,
        mediaType: media.mediaType,
        storage: media.storage,
        path: media.storage === "PUBLIC_ASSET" ? media.assetPath : null,
        url: media.storage === "EXTERNAL" ? media.sourceUrl : null
      }))
  };
}

function handleGet(action, params) {
  if (action === "health") return envelope({ status: "ok", schemaVersion: "2", dataRevision: "1" });
  if (action === "public.tree") {
    return envelope({
      schemaVersion: "1",
      branches: data.branches,
      people: data.people.map((person) => ({
        personId: person.personId,
        displayName: person.displayName,
        birthYear: person.birthYear,
        deathYear: person.deathYear,
        isLiving: person.isLiving,
        branchId: person.branchId,
        generation: person.generation,
        sortOrder: person.sortOrder,
        years: person.years,
        parentIds: person.parentIds,
        spouseIds: person.spouseIds,
        childIds: person.childIds,
        hasPublicDetails: !person.isLiving && person.detailsVisibility !== "FAMILY",
        avatar: avatarOf(person)
      }))
    });
  }
  if (action === "public.person") {
    const person = personById(params.id);
    if (!person) return failure(404, "PERSON_NOT_FOUND", "Человек не найден в опубликованном архиве.");
    if (!(!person.isLiving && person.detailsVisibility !== "FAMILY")) {
      return failure(401, "FAMILY_ACCESS_REQUIRED", "Подробная карточка доступна только в семейном режиме.");
    }
    return envelope(personCard(params.id));
  }
  if (action === "public.timeline") {
    return envelope({
      events: data.events
        .filter((event) => event.visibility === "PUBLIC")
        .map((event) => ({
          eventId: event.eventId,
          eventType: event.eventType,
          title: event.title,
          date: event.displayDate,
          sortKey: event.startSortKey,
          description: event.publicDescription,
          primaryPersonId: event.primaryPersonId || null
        }))
    });
  }
  if (action === "public.gallery") {
    const limit = Math.min(Math.max(Number(params.limit ?? 24) || 24, 1), 60);
    let offset = 0;
    if (params.cursor) {
      try {
        offset = JSON.parse(Buffer.from(params.cursor.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).o;
      } catch {
        return failure(400, "BAD_CURSOR", "Некорректный курсор пагинации.");
      }
      if (typeof offset !== "number" || offset < 0) return failure(400, "BAD_CURSOR", "Некорректный курсор пагинации.");
    }
    const sorted = data.media.filter((media) => media.visibility === "PUBLIC");
    const page = sorted.slice(offset, offset + limit);
    return envelope({
      items: page.map((media) => ({
        mediaId: media.mediaId,
        title: media.title,
        category: media.category,
        mediaType: media.mediaType,
        dateDisplay: media.dateDisplay,
        altText: media.altText,
        caption: media.publicCaption,
        storage: media.storage,
        path: media.storage === "PUBLIC_ASSET" ? media.assetPath : null,
        url: media.storage === "EXTERNAL" ? media.sourceUrl : null,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height
      })),
      nextCursorOffset: offset + limit < sorted.length ? offset + limit : null
    });
  }
  const privateActions = ["auth.login", "auth.status", "auth.logout", "private.person", "private.timeline", "private.gallery", "private.media"];
  if (privateActions.includes(action)) return failure(400, "WRONG_METHOD", "Это приватный action: используйте POST.");
  return failure(400, "UNKNOWN_ACTION", "Неизвестное действие API.");
}

function handlePost(action, params) {
  if (action === "auth.login") {
    if (loginFailures >= LOGIN_MAX_FAILURES) {
      return failure(429, "RATE_LIMITED", "Слишком много неудачных попыток входа.", { retryable: true, retryAfterSeconds: 900 });
    }
    if (params.password !== FAMILY_PASSWORD) {
      loginFailures += 1;
      return failure(401, "INVALID_CREDENTIALS", "Неверный семейный пароль.");
    }
    loginFailures = 0;
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    sessions.add(token);
    return envelope({ token, createdAt: new Date().toISOString() });
  }
  const valid = params.token && sessions.has(params.token);
  if (action === "auth.status") {
    if (!valid) return failure(401, "SESSION_INVALID", "Семейная сессия недействительна. Войдите ещё раз.");
    return envelope({ valid: true });
  }
  if (action === "auth.logout") {
    if (params.token) sessions.delete(params.token);
    return envelope({ loggedOut: true });
  }
  if (!valid) return failure(401, "SESSION_INVALID", "Семейная сессия недействительна. Войдите ещё раз.");
  if (action === "private.person") {
    const person = personById(params.id);
    if (!person) return failure(404, "PERSON_NOT_FOUND", "Человек не найден.");
    const details = personById(params.id) ?? {};
    return envelope({
      personId: params.id,
      bio: details.familyBio || details.publicBio || "",
      birth: person.birthDate ? { date: person.birthDate, precision: "YEAR" } : null,
      birthPlace: details.familyBirthPlace || details.publicBirthPlace || "",
      contacts: details.familyContacts || "",
      notes: details.familyNotes || "",
      materials: data.personMedia
        .filter((link) => link.personId === params.id)
        .map((link) => mediaById(link.mediaId))
        .filter((media) => media && media.visibility === "FAMILY")
        .map((media) => ({
          mediaId: media.mediaId,
          title: media.title,
          category: media.category,
          role: "GALLERY",
          dateDisplay: media.dateDisplay,
          altText: media.altText,
          caption: media.familyCaption || media.publicCaption,
          mediaType: media.mediaType,
          mimeType: media.mimeType,
          storage: media.storage,
          url: media.storage === "EXTERNAL" ? media.sourceUrl : null
        }))
    });
  }
  if (action === "private.timeline") {
    const events = [];
    data.events.forEach((event) => {
      if (event.visibility === "FAMILY") {
        events.push({
          eventId: event.eventId,
          eventType: event.eventType,
          title: event.title,
          date: event.displayDate,
          sortKey: event.startSortKey,
          description: event.familyDescription || event.publicDescription,
          primaryPersonId: event.primaryPersonId || null
        });
      } else if (event.familyDescription) {
        events.push({ eventId: event.eventId, familyDescription: event.familyDescription });
      }
    });
    return envelope({ events });
  }
  if (action === "private.gallery") {
    return envelope({
      items: data.media
        .filter((media) => media.visibility === "FAMILY")
        .map((media) => ({
          mediaId: media.mediaId,
          title: media.title,
          category: media.category,
          mediaType: media.mediaType,
          dateDisplay: media.dateDisplay,
          altText: media.altText,
          caption: media.familyCaption || media.publicCaption,
          mimeType: media.mimeType,
          storage: media.storage,
          url: media.storage === "EXTERNAL" ? media.sourceUrl : null,
          width: media.width,
          height: media.height
        }))
    });
  }
  if (action === "private.media") {
    if (!/^m_\d+$/.test(params.id ?? "")) return failure(400, "BAD_MEDIA_ID", "Некорректный mediaId.");
    const media = mediaById(params.id);
    if (!media || media.visibility !== "FAMILY") return failure(404, "MEDIA_NOT_FOUND", "Материал не найден.");
    if (media.storage === "EXTERNAL") return envelope({ mediaId: media.mediaId, storage: "EXTERNAL", url: media.sourceUrl, mimeType: media.mimeType });
    if (media.storage === "PUBLIC_ASSET") return envelope({ mediaId: media.mediaId, storage: "PUBLIC_ASSET", path: media.assetPath, mimeType: media.mimeType });
    return envelope({
      mediaId: media.mediaId,
      storage: "DRIVE",
      fileName: "family-photo.png",
      mimeType: "image/png",
      byteSize: PNG_BYTES.length,
      base64: PNG_BYTES.toString("base64")
    });
  }
  if (["health", "public.tree", "public.person", "public.timeline", "public.gallery"].includes(action)) {
    return failure(400, "WRONG_METHOD", "Это публичный action: используйте GET.");
  }
  return failure(400, "UNKNOWN_ACTION", "Неизвестное действие API.");
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/exec") {
    response.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    response.end(failure(404, "NOT_FOUND", "Используйте /exec."));
    return;
  }
  const params = Object.fromEntries(url.searchParams.entries());
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    if (request.method === "POST" && request.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
      new URLSearchParams(body).forEach((value, key) => {
        params[key] = value;
      });
    }
    const action = params.action ?? "";
    let payload;
    try {
      payload = request.method === "GET" ? handleGet(action, params) : handlePost(action, params);
    } catch {
      payload = failure(500, "INTERNAL_ERROR", "Внутренняя ошибка архива.");
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    response.end(payload);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`mock-api listening on http://127.0.0.1:${PORT}/exec\n`);
});
