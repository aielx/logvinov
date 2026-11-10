/**
 * Генерация tests/fixtures/mock-api/data.json из демо-набора v2 (apps-script/src/Seed.ts).
 * Контракт данных mock-API не меняется — меняется только источник строк.
 *
 * Запуск: npm run gen:mock
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO } from "../apps-script/src/Seed";
import { HEADERS, SHEETS } from "../apps-script/src/Config";
import { recordsFromValues } from "../apps-script/src/SheetsRepository";
import { validateArchive } from "../apps-script/src/Validation";
import { formatIsoDate } from "../apps-script/src/Util";
import type { RawRecords } from "../apps-script/src/Types";

const HERE = dirname(fileURLToPath(import.meta.url));

function sheetValues(sheetName: string, rows: ReadonlyArray<ReadonlyArray<unknown>>): unknown[][] {
  return [[...(HEADERS[sheetName] as string[])], ...rows.map((row) => [...row])];
}

const raw: RawRecords = {
  people: recordsFromValues(SHEETS.PEOPLE, sheetValues(SHEETS.PEOPLE, DEMO.people)) as never,
  events: recordsFromValues(SHEETS.EVENTS, sheetValues(SHEETS.EVENTS, DEMO.events)) as never,
  materials: recordsFromValues(SHEETS.MATERIALS, sheetValues(SHEETS.MATERIALS, DEMO.materials)) as never,
  schemaErrors: []
};

const archive = validateArchive(raw);
if (archive.issues.length > 0) {
  console.error("Демо-данные содержат ошибки валидации:", archive.issues);
  process.exit(1);
}

const payload = {
  people: Array.from(archive.people.values()).map((person) => ({
    personId: person.personId,
    displayName: person.displayName,
    birthYear: person.birthYear,
    deathYear: person.deathYear,
    isLiving: person.isLiving,
    branchId: person.branchId,
    generation: person.generation,
    sortOrder: person.sortOrder,
    years: `${person.birthYear ?? "?"}${person.isLiving ? "–н. в." : person.deathYear !== null ? `–${person.deathYear}` : ""}`,
    parentIds: person.parentIds,
    spouseIds: person.spouseIds,
    childIds: person.childIds,
    detailsVisibility: person.detailsVisibility,
    birthDate: person.birthDate?.year ? (formatIsoDate(person.birthDate) ?? String(person.birthDate.year)) : "",
    deathDate: person.deathDate?.year ? (formatIsoDate(person.deathDate) ?? String(person.deathYear)) : "",
    avatar: person.publicAvatarUrl,
    // Поля для карточек mock-API:
    publicBio: person.publicBio,
    familyBio: person.familyBio,
    publicBirthPlace: person.publicBirthPlace,
    familyBirthPlace: person.familyBirthPlace,
    familyContacts: person.familyContacts,
    familyNotes: person.familyNotes
  })),
  events: archive.events.map((event) => ({
    eventId: event.eventId,
    eventType: event.eventType,
    title: event.title,
    displayDate: event.displayDate,
    startSortKey: event.startSortKey,
    precision: event.precision,
    publicDescription: event.publicDescription,
    familyDescription: event.familyDescription,
    visibility: event.visibility,
    primaryPersonId: event.primaryPersonId ?? ""
  })),
  media: Array.from(archive.media.values()).map((media) => ({
    mediaId: media.mediaId,
    title: media.title,
    category: media.category,
    mediaType: media.mediaType,
    visibility: media.visibility,
    dateDisplay: media.dateDisplay,
    altText: media.altText,
    publicCaption: media.publicCaption,
    familyCaption: media.familyCaption,
    sourceUrl: media.externalUrl ?? (media.driveFileId ? `https://drive.google.com/file/d/${media.driveFileId}/view` : ""),
    storage: media.storage,
    assetPath: media.assetPath ?? "",
    mimeType: media.mimeType,
    width: media.width,
    height: media.height,
    sortOrder: media.sortOrder
  })),
  personMedia: archive.personMaterials.map((link) => ({
    personId: link.personId,
    mediaId: link.mediaId,
    role: link.role
  })),
  branches: archive.branches
};

const target = resolve(HERE, "../tests/fixtures/mock-api/data.json");
writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`OK: ${target} (${payload.people.length} людей, ${payload.events.length} событий, ${payload.media.length} материалов, ветви: ${payload.branches.map((b) => b.branchId).join(", ")})`);
