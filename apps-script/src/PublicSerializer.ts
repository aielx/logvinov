/**
 * Публичный сериализатор: ответ собирается строго из разрешённых полей (allowlist).
 * Удаление «опасных» полей из полной записи не используется.
 * Поля с префиксом family не попадают в публичные ответы никогда.
 */
import {
  ApiFailure,
  ValidatedArchive,
  ValidatedEvent,
  ValidatedMedia,
  ValidatedPerson
} from "./Types";
import { SHEETS } from "./Config";
import { formatYears } from "./Util";

export interface PublicAvatar {
  storage: "PUBLIC_ASSET" | "EXTERNAL" | "DRIVE_PUBLIC";
  path?: string;
  url?: string;
}

/** Аватар для публичного древа/карточки берётся из колонки «Фото» человека. */
export function publicAvatar(_archive: ValidatedArchive, person: ValidatedPerson): PublicAvatar | null {
  return person.publicAvatarUrl;
}

/** Доступна ли подробная карточка без входа. */
export function isPubliclyDetailed(person: ValidatedPerson): boolean {
  return !person.isLiving && person.detailsVisibility === "PUBLIC";
}

function publicPersonMini(archive: ValidatedArchive, person: ValidatedPerson) {
  return {
    personId: person.personId,
    displayName: person.displayName,
    years: formatYears(person.birthYear, person.deathYear, person.isLiving),
    isLiving: person.isLiving
  };
}

export function serializeTree(archive: ValidatedArchive): object {
  return {
    schemaVersion: archive.schemaVersion,
    branches: archive.branches.map((branch) => ({
      branchId: branch.branchId,
      label: branch.label,
      sortOrder: branch.sortOrder
    })),
    people: Array.from(archive.people.values())
      .sort((a, b) => a.generation - b.generation || a.sortOrder - b.sortOrder || a.personId.localeCompare(b.personId))
      .map((person) => ({
        personId: person.personId,
        displayName: person.displayName,
        birthYear: person.birthYear,
        deathYear: person.deathYear,
        isLiving: person.isLiving,
        branchId: person.branchId,
        generation: person.generation,
        sortOrder: person.sortOrder,
        years: formatYears(person.birthYear, person.deathYear, person.isLiving),
        parentIds: person.parentIds.slice(),
        spouseIds: person.spouseIds.slice(),
        childIds: person.childIds.slice(),
        hasPublicDetails: isPubliclyDetailed(person),
        avatar: publicAvatar(archive, person)
      }))
  };
}

/** Публичная подробная карточка. null — человек не найден; FAMILY_REQUIRED — карточка семейная. */
export function serializePerson(archive: ValidatedArchive, personId: string): object {
  const person = archive.people.get(personId);
  if (!person) {
    throw new ApiFailure(404, "PERSON_NOT_FOUND", "Человек не найден в опубликованном архиве.");
  }
  if (!isPubliclyDetailed(person)) {
    throw new ApiFailure(401, "FAMILY_ACCESS_REQUIRED", "Подробная карточка доступна только в семейном режиме.");
  }
  const relations = (ids: string[], relation: string) =>
    ids
      .map((id) => archive.people.get(id))
      .filter((other): other is ValidatedPerson => Boolean(other))
      .map((other) => ({ ...publicPersonMini(archive, other), relation }));
  const death = person.deathDate
    ? {
        date: formatIsoDate(person.deathDate),
        precision: person.deathDate.precision,
        year: person.deathDate.year
      }
    : null;
  const birth = person.birthDate
    ? {
        date: formatIsoDate(person.birthDate),
        precision: person.birthDate.precision,
        year: person.birthDate.year
      }
    : null;

  return {
    personId: person.personId,
    displayName: person.displayName,
    years: formatYears(person.birthYear, person.deathYear, person.isLiving),
    generation: person.generation,
    branchId: person.branchId,
    branchLabel: archive.branches.find((b) => b.branchId === person.branchId)?.label ?? null,
    bio: person.publicBio,
    birthPlace: person.publicBirthPlace,
    birth,
    death,
    avatar: publicAvatar(archive, person),
    relatives: [
      ...relations(person.parentIds, "parent"),
      ...relations(person.spouseIds, "spouse"),
      ...relations(person.childIds, "child")
    ],
    materials: publicPersonMaterials(archive, personId)
  };
}

export function formatIsoDate(date: { year: number | null; month: number | null; day: number | null }): string | null {
  if (date.year === null) return null;
  const year = String(date.year);
  if (date.month === null) return year;
  const month = String(date.month).padStart(2, "0");
  if (date.day === null) return `${year}-${month}`;
  return `${year}-${month}-${String(date.day).padStart(2, "0")}`;
}

export function publicPersonMaterials(archive: ValidatedArchive, personId: string): object[] {
  return archive.personMaterials
    .filter((link) => link.personId === personId)
    .filter((link) => {
      const media = archive.media.get(link.mediaId);
      return media !== undefined && media.visibility === "PUBLIC";
    })
      .map((link) => {
      const media = archive.media.get(link.mediaId) as ValidatedMedia;
      return {
        mediaId: media.mediaId,
        title: media.title,
        category: media.category,
        role: link.role,
        dateDisplay: media.dateDisplay,
        altText: media.altText,
        caption: media.publicCaption,
        mediaType: media.mediaType,
        storage: media.storage,
        path: media.storage === "PUBLIC_ASSET" ? media.assetPath : null,
        // Публичные фото — прямые ссылки (EXTERNAL/DRIVE_PUBLIC); публичный файл
        // Drive c категорией «Документы» тоже требует доступа «по ссылке».
        url: media.storage === "EXTERNAL" || media.storage === "DRIVE_PUBLIC"
          ? media.externalUrl
          : media.storage === "DRIVE"
            ? `https://drive.google.com/uc?export=view&id=${media.driveFileId}`
            : null
      };
    });
}

export function serializeTimeline(archive: ValidatedArchive): object {
  return {
    events: archive.events
      .filter((event) => event.visibility === "PUBLIC")
      .map((event: ValidatedEvent) => ({
        eventId: event.eventId,
        eventType: event.eventType,
        title: event.title,
        date: event.displayDate,
        sortKey: event.startSortKey,
        description: event.publicDescription,
        primaryPersonId: event.primaryPersonId
      }))
  };
}

export function serializeGalleryPage(
  archive: ValidatedArchive,
  offset: number,
  limit: number
): { items: object[]; nextCursorOffset: number | null } {
  const sorted = Array.from(archive.media.values())
    .filter((media) => media.visibility === "PUBLIC")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sortKey - b.sortKey || a.mediaId.localeCompare(b.mediaId));
  const page = sorted.slice(offset, offset + limit);
  return {
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
      url: media.storage === "EXTERNAL" || media.storage === "DRIVE_PUBLIC"
        ? media.externalUrl
        : media.storage === "DRIVE"
          ? `https://drive.google.com/uc?export=view&id=${media.driveFileId}`
          : null,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height
    })),
    nextCursorOffset: offset + limit < sorted.length ? offset + limit : null
  };
}
