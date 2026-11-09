/**
 * Приватный сериализатор: только дополнительные семейные поля и personId/mediaId.
 * Клиент объединяет их с уже загруженной публичной записью в памяти браузера.
 * Вызывается только после серверной проверки сессии.
 */
import { ApiFailure, ValidatedArchive, ValidatedPerson } from "./Types";
import { formatIsoDate } from "./PublicSerializer";

export function serializePrivatePerson(archive: ValidatedArchive, personId: string): object {
  const person = archive.people.get(personId);
  if (!person) {
    throw new ApiFailure(404, "PERSON_NOT_FOUND", "Человек не найден в опубликованном архиве.");
  }
  const exactDate = (date: ValidatedPerson["birthDate"]) =>
    date && date.year !== null ? { date: formatIsoDate(date), precision: date.precision } : null;

  return {
    personId: person.personId,
    bio: person.familyBio || person.publicBio,
    birth: exactDate(person.birthDate),
    birthPlace: person.familyBirthPlace || person.publicBirthPlace,
    contacts: person.familyContacts,
    notes: person.familyNotes,
    materials: privatePersonMaterials(archive, personId)
  };
}

/** Семейные материалы человека: метаданные без байтов; DRIVE-файлы загружаются отдельным запросом. */
function privatePersonMaterials(archive: ValidatedArchive, personId: string): object[] {
  const items: object[] = [];
  archive.personMaterials.forEach((link: { personId: string; mediaId: string; role: string }) => {
    if (link.personId !== personId) return;
    const media = archive.media.get(link.mediaId);
    if (!media || media.visibility !== "FAMILY") return;
    items.push({
      mediaId: media.mediaId,
      title: media.title,
      category: media.category,
      role: link.role,
      dateDisplay: media.dateDisplay,
      altText: media.altText,
      caption: media.familyCaption || media.publicCaption,
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      storage: media.storage,
      // Прямые ссылки (внешние и фото из Drive) выдаются только после входа;
      // закрытые DRIVE-документы грузятся отдельным запросом private.media.
      url: media.storage === "EXTERNAL" || media.storage === "DRIVE_PUBLIC" ? media.externalUrl : null
    });
  });
  return items;
}

/**
 * Семейная хронология: полные данные событий с visibility=FAMILY и семейные описания публичных.
 * Массив для слияния по eventId.
 */
export function serializePrivateTimeline(archive: ValidatedArchive): object {
  const items: object[] = [];
  archive.events.forEach((event) => {
    if (event.visibility === "FAMILY") {
      items.push({
        eventId: event.eventId,
        eventType: event.eventType,
        title: event.title,
        date: event.displayDate,
        sortKey: event.startSortKey,
        description: event.familyDescription || event.publicDescription,
        primaryPersonId: event.primaryPersonId
      });
    } else if (event.familyDescription) {
      items.push({
        eventId: event.eventId,
        familyDescription: event.familyDescription
      });
    }
  });
  return { events: items };
}

/** Метаданные семейных материалов галереи (без байтов). */
export function serializePrivateGallery(archive: ValidatedArchive): object {
  const items = Array.from(archive.media.values())
    .filter((media) => media.visibility === "FAMILY")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sortKey - b.sortKey || a.mediaId.localeCompare(b.mediaId))
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
      url: media.storage === "EXTERNAL" || media.storage === "DRIVE_PUBLIC" ? media.externalUrl : null,
      width: media.width,
      height: media.height
    }));
  return { items };
}
