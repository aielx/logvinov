import { beforeEach, describe, expect, it } from "vitest";
import { validateArchive } from "../src/Validation";
import { serializeTree, serializePerson, serializeTimeline, serializeGalleryPage } from "../src/PublicSerializer";
import { serializePrivatePerson, serializePrivateTimeline, serializePrivateGallery } from "../src/PrivateSerializer";
import { recordsFromValues } from "../src/SheetsRepository";
import { SHEETS } from "../src/Config";
import { demoSheetValues, CANARY_STRINGS } from "./fixture";
import type { RawRecords } from "../src/Types";

function buildArchive() {
  const values = demoSheetValues();
  return validateArchive({
    people: recordsFromValues(SHEETS.PEOPLE, values[SHEETS.PEOPLE]) as never,
    events: recordsFromValues(SHEETS.EVENTS, values[SHEETS.EVENTS]) as never,
    materials: recordsFromValues(SHEETS.MATERIALS, values[SHEETS.MATERIALS]) as never,
    schemaErrors: []
  });
}

function collectKeys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap((item) => collectKeys(item, `${prefix}[].`)))];
  if (value && typeof value === "object") {
    return [...new Set(Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [`${prefix}${k}`, ...collectKeys(v, `${prefix}${k}.`)]))];
  }
  return [];
}

let archive: ReturnType<typeof buildArchive>;

beforeEach(() => {
  archive = buildArchive();
});

describe("Allowlist публичных сериализаторов", () => {
  it("public.tree содержит строго ожидаемые ключи", () => {
    const tree = serializeTree(archive) as Record<string, unknown>;
    const keys = new Set(collectKeys(tree));
    const expected = new Set([
      "schemaVersion",
      "branches", "branches.[].branchId", "branches.[].label", "branches.[].sortOrder",
      "people", "people.[].personId", "people.[].displayName", "people.[].birthYear", "people.[].deathYear",
      "people.[].isLiving", "people.[].branchId", "people.[].generation", "people.[].sortOrder", "people.[].years",
      "people.[].parentIds", "people.[].spouseIds", "people.[].childIds", "people.[].hasPublicDetails",
      "people.[].avatar", "people.[].avatar.storage", "people.[].avatar.path"
    ]);
    expect([...keys].sort()).toEqual([...expected].sort());
    const people = tree.people as Array<Record<string, unknown>>;
    expect(people.length).toBe(10);
    expect(people[0]).toHaveProperty("years", "1890–1955");
    expect(people[0]).not.toHaveProperty("publicBio");
    expect(people[0]).not.toHaveProperty("familyBio");
  });

  it("public.person умершего: биография публична, ключи ограничены", () => {
    const person = serializePerson(archive, "p_0001") as Record<string, unknown>;
    expect(person.bio).toContain("Крестьянин");
    const keys = new Set(collectKeys(person));
    expect([...keys].sort()).toEqual([
      "personId", "displayName", "years", "generation", "branchId", "branchLabel", "bio", "birthPlace",
      "birth", "birth.date", "birth.precision", "birth.year",
      "death", "death.date", "death.precision", "death.year",
      "avatar", "avatar.storage", "avatar.path",
      "relatives", "relatives.[].personId", "relatives.[].displayName", "relatives.[].years", "relatives.[].isLiving", "relatives.[].relation",
      "materials", "materials.[].mediaId", "materials.[].title", "materials.[].category", "materials.[].role",
      "materials.[].dateDisplay", "materials.[].altText", "materials.[].caption", "materials.[].mediaType",
      "materials.[].storage", "materials.[].path", "materials.[].url"
    ].sort());
    expect(JSON.stringify(person)).not.toContain("CANARY");
  });

  it("public.timeline и public.gallery не содержат семейных событий и материалов", () => {
    const timeline = serializeTimeline(archive) as { events: unknown[] };
    expect(timeline.events.length).toBe(11);
    const gallery = serializeGalleryPage(archive, 0, 60);
    expect((gallery.items as unknown[]).length).toBe(8);
    const serialized = JSON.stringify({ timeline, gallery });
    CANARY_STRINGS.forEach((canary) => expect(serialized).not.toContain(canary));
  });

  it("пагинация: лимит и курсор-смещение", () => {
    const first = serializeGalleryPage(archive, 0, 3);
    expect(first.items.length).toBe(3);
    expect(first.nextCursorOffset).toBe(3);
    const second = serializeGalleryPage(archive, first.nextCursorOffset as number, 60);
    expect(second.items.length).toBe(5);
    expect(second.nextCursorOffset).toBeNull();
  });
});

describe("Приватные сериализаторы (только после входа)", () => {
  it("private.person живого содержит семейные поля и personId для слияния", () => {
    const person = serializePrivatePerson(archive, "p_0008") as Record<string, unknown>;
    expect(person.personId).toBe("p_0008");
    expect(String(person.bio)).toContain("CANARY p0008");
    expect(person.contacts).toContain("CANARY");
    expect((person.materials as unknown[]).length).toBe(1);
  });

  it("private.timeline возвращает семейное событие", () => {
    const timeline = serializePrivateTimeline(archive) as { events: Array<Record<string, unknown>> };
    const familyEvent = timeline.events.find((e) => String(e.description ?? "").includes("CANARY"));
    expect(familyEvent).toBeDefined();
    expect(familyEvent?.eventId).toBe("e_0013");
  });

  it("private.gallery возвращает только семейные материалы", () => {
    const gallery = serializePrivateGallery(archive) as { items: Array<Record<string, unknown>> };
    expect(gallery.items.length).toBe(2);
    expect(gallery.items.every((item) => item.storage === "DRIVE" || item.storage === "EXTERNAL")).toBe(true);
  });
});
