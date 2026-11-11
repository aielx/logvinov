/**
 * Валидация архива (схема v2, «человеческая»).
 * Три вкладки: Люди / События / Материалы. Связи — по стабильному № человека.
 * Значения можно писать по-русски («Семейная», «Историческое», чекбоксы) —
 * они нормализуются здесь. Публичный контракт API при этом не меняется.
 *
 * Чистая функция: не касается сервисов Apps Script.
 */
import {
  DataIssue,
  DatePrecision,
  EventType,
  MaterialRole,
  MediaCategory,
  MediaStorage,
  ParsedDate,
  RawRecords,
  ResolvedPhoto,
  ValidatedArchive,
  ValidatedBranch,
  ValidatedEvent,
  ValidatedMedia,
  ValidatedPerson,
  ValidatedPersonMaterial,
  Visibility
} from "./Types";
import { ALLOWED_MIME_TYPES, SCHEMA_VERSION } from "./Config";
import {
  driveImageUrl,
  extractDriveFileId,
  isBlank,
  isDriveUrl,
  isSafeAssetPath,
  isSafeExternalUrl,
  parseFlexibleDate,
  toText
} from "./Util";

function issue(target: { issues: DataIssue[] }, sheet: string, rowNumber: number, recordId: string, code: string, message: string): void {
  target.issues.push({ sheet, rowNumber, recordId, code, message });
}

// --- Нормализация человекочитаемых значений ---------------------------------

export function normalizeBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = toText(value).toUpperCase();
  if (["TRUE", "ДА", "YES", "1", "+"].includes(text)) return true;
  if (["", "FALSE", "НЕТ", "NO", "0", "-", "—"].includes(text)) return false;
  return null;
}

/** «Семейн*» → FAMILY, «Публичн*» → PUBLIC, пусто → null (авто). */
export function normalizeVisibility(value: unknown): Visibility | null | "INVALID" {
  const text = toText(value).toLowerCase();
  if (text === "") return null;
  if (text.startsWith("семейн")) return "FAMILY";
  if (text.startsWith("публичн")) return "PUBLIC";
  if (text === "family") return "FAMILY";
  if (text === "public") return "PUBLIC";
  return "INVALID";
}

export function normalizeEventType(value: unknown): EventType | "INVALID" {
  const text = toText(value).toLowerCase();
  if (text.startsWith("истор")) return "HISTORY";
  if (text.startsWith("семейн") || text === "") return "FAMILY";
  if (text === "history") return "HISTORY";
  if (text === "family") return "FAMILY";
  return "INVALID";
}

export function normalizeCategory(value: unknown): MediaCategory {
  const text = toText(value).toLowerCase();
  if (text.startsWith("док")) return "documents";
  if (text.startsWith("портрет")) return "portraits";
  if (text === "documents") return "documents";
  if (text === "portraits") return "portraits";
  return "archive";
}

export function normalizeRole(value: unknown): MaterialRole {
  const text = toText(value).toLowerCase();
  if (text.startsWith("портрет")) return "PORTRAIT";
  if (text.startsWith("док") || text.startsWith("источник")) return "SOURCE";
  return "GALLERY";
}

/**
 * Фото (единое правило): публичная ссылка на файл — Drive (с доступом «по ссылке»,
 * превращается в прямую картинку), внешний https или путь assets/… — или null (заглушка).
 */
export function resolvePhoto(raw: string): ResolvedPhoto | "INVALID" | null {
  const value = toText(raw);
  if (value === "") return null;
  if (isDriveUrl(value)) {
    const id = extractDriveFileId(value);
    return id ? { storage: "DRIVE_PUBLIC", url: driveImageUrl(id, 400) } : "INVALID";
  }
  if (isSafeExternalUrl(value)) return { storage: "EXTERNAL", url: value };
  if (isSafeAssetPath(value)) return { storage: "PUBLIC_ASSET", path: value };
  return "INVALID";
}

function padId(prefix: string, number: number): string {
  return `${prefix}_${String(number).padStart(4, "0")}`;
}

/**
 * Разбор ссылки на человека: «12 · Мария Ивановна…» или просто «12».
 * Возвращает №, null (пусто) или -1 (неверное значение — например, ФИО без №).
 */
function parseRefNumber(value: unknown): number | null {
  const text = toText(value);
  if (text === "") return null;
  const match = /^\s*(\d+)/.exec(text);
  return match ? parseInt(match[1], 10) : -1;
}

// --- Главная функция ---------------------------------------------------------

export function validateArchive(raw: RawRecords): ValidatedArchive {
  const archive: ValidatedArchive = {
    schemaVersion: SCHEMA_VERSION,
    dataRevision: "1",
    people: new Map(),
    events: [],
    media: new Map(),
    personMaterials: [],
    branches: [],
    issues: [],
    degraded: false
  };

  const drafts = validatePeople(raw, archive);
  buildRelations(archive, drafts);
  breakCycles(archive);
  computeGenerations(archive);
  archive.branches = buildBranches(archive);
  validateEvents(raw, archive, drafts);
  validateMaterials(raw, archive, drafts);

  archive.degraded = archive.issues.length > 0;
  return archive;
}

interface PersonDraft {
  number: number;
  person: ValidatedPerson;
  father: number | null;
  mother: number | null;
  spouse: number | null;
  rowNumber: number;
}

function validatePeople(raw: RawRecords, archive: ValidatedArchive): Map<number, PersonDraft> {
  const drafts = new Map<number, PersonDraft>();
  const sheet = "Люди";

  raw.people.forEach((row) => {
    if (isBlank(row.fullName) && isBlank(row.number)) return; // пустая строка
    if (normalizeBool(row.draft) === true) return;

    const number = parseInt(toText(row.number), 10);
    if (!Number.isFinite(number) || number < 1 || number > 9999) {
      issue(archive, sheet, row.rowNumber, toText(row.number), "PERSON_NO_ID", "Не заполнен уникальный № человека (колонка A). Проще всего: меню «Семейный архив → Проставить номера».");
      return;
    }
    if (drafts.has(number)) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_DUPLICATE_ID", `№ ${number} уже занят другим человеком.`);
      return;
    }
    if (isBlank(row.fullName)) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_NO_NAME", "Не заполнено ФИО.");
      return;
    }

    const isLiving = normalizeBool(row.isLiving);
    if (isLiving === null) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_LIVING", "«Живой» должно быть ДА/НЕТ (чекбокс).");
      return;
    }
    const birth = parseFlexibleDate(row.birthDate);
    if (birth === null) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_BIRTH", `Некорректная дата рождения «${toText(row.birthDate)}» (нужно 1890, 1937-03, 14.03.1937 или 1937-03-14).`);
      return;
    }
    const death = parseFlexibleDate(row.deathDate);
    if (death === null) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_DEATH", `Некорректная дата смерти «${toText(row.deathDate)}».`);
      return;
    }
    if (isLiving && death.year !== null) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_LIVING_WITH_DEATH", "У живого указана дата смерти.");
      return;
    }
    if (birth.year !== null && death.year !== null && death.sortKey < birth.sortKey) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_DIED_BEFORE_BIRTH", "Дата смерти раньше даты рождения.");
      return;
    }

    const declared = normalizeVisibility(row.cardVisibility);
    if (declared === "INVALID") {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_VISIBILITY", "«Видимость карточки»: Семейная или Публичная (или пусто).");
      return;
    }
    let detailsVisibility: Visibility;
    if (declared === "FAMILY") {
      detailsVisibility = "FAMILY";
    } else if (isLiving) {
      // Живой всегда защищён, включая ошибочную «Публичную» (правило data-policy №2).
      detailsVisibility = "FAMILY";
      if (declared === "PUBLIC") {
        issue(archive, sheet, row.rowNumber, String(number), "PERSON_LIVING_FORCED_FAMILY", "Для живого выбрана «Публичная» — подробности остаются семейными.");
      }
    } else {
      detailsVisibility = "PUBLIC";
    }

    const photo = resolvePhoto(row.photo);
    if (photo === "INVALID") {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_PHOTO", "«Фото» должно быть ссылкой Drive, https-адресом или путём assets/…");
    }
    const publicAvatarUrl = photo && photo !== "INVALID" ? photo : null;

    drafts.set(number, {
      number,
      rowNumber: row.rowNumber,
      father: parseRefNumber(row.father),
      mother: parseRefNumber(row.mother),
      spouse: parseRefNumber(row.spouse),
      person: {
        personId: padId("p", number),
        displayName: toText(row.fullName),
        isLiving,
        branchId: toText(row.branch),
        publicBio: toText(row.publicBio),
        familyBio: toText(row.familyBio),
        publicBirthPlace: toText(row.publicBirthPlace),
        familyBirthPlace: toText(row.familyBirthPlace),
        familyContacts: toText(row.familyContacts),
        familyNotes: toText(row.familyNotes),
        birthYear: birth.year,
        deathYear: death.year,
        birthDate: birth.year !== null ? birth : null,
        deathDate: death.year !== null ? death : null,
        detailsVisibility,
        publicAvatarUrl,
        sortOrder: number,
        generation: 1,
        parentIds: [],
        spouseIds: [],
        childIds: []
      }
    });
  });
  drafts.forEach((draft) => {
    archive.people.set(draft.person.personId, draft.person);
  });
  return drafts;
}

function buildRelations(archive: ValidatedArchive, drafts: Map<number, PersonDraft>): void {
  const sheet = "Люди";
  const pairSeen = new Set<string>();

  drafts.forEach((draft) => {
    const link = (ref: number | null, kind: string): PersonDraft | null => {
      if (ref === null) return null;
      if (ref === -1) {
        issue(archive, sheet, draft.rowNumber, draft.person.personId, "PERSON_BAD_REF", `Колонка «${kind}»: выберите человека из списка (или оставьте пустой).`);
        return null;
      }
      if (ref === draft.number) {
        issue(archive, sheet, draft.rowNumber, draft.person.personId, "PERSON_SELF_REF", `В колонке «${kind}» выбран сам человек.`);
        return null;
      }
      const other = drafts.get(ref);
      if (!other) {
        issue(archive, sheet, draft.rowNumber, draft.person.personId, "PERSON_UNKNOWN_REF", `«${kind}»: человек с № ${ref} не найден.`);
        return null;
      }
      return other;
    };

    const father = link(draft.father, "Отец");
    const mother = link(draft.mother, "Мать");
    [father, mother].forEach((parent) => {
      if (!parent) return;
      if (parent.person.birthYear !== null && draft.person.birthYear !== null && draft.person.birthYear - parent.person.birthYear < 13) {
        issue(archive, sheet, draft.rowNumber, draft.person.personId, "REL_IMPLAUSIBLE_AGE", `Родитель № ${parent.number} младше ребёнка менее чем на 13 лет — проверьте данные.`);
      }
      draft.person.parentIds.push(parent.person.personId);
      parent.person.childIds.push(draft.person.personId);
    });

    const spouse = link(draft.spouse, "Супруг(а)");
    if (spouse) {
      // Встречные строки пары не должны дублировать связь.
      if (!draft.person.spouseIds.includes(spouse.person.personId)) {
        draft.person.spouseIds.push(spouse.person.personId);
      }
      if (!spouse.person.spouseIds.includes(draft.person.personId)) {
        spouse.person.spouseIds.push(draft.person.personId);
      }
      const key = [draft.person.personId, spouse.person.personId].sort().join("+");
      if (!pairSeen.has(key)) {
        pairSeen.add(key);
      }
    }
  });
}

/**
 * Циклы родительских связей: ребро циклично, если родитель достижим из ребёнка
 * по цепочке детей. Удаляется самое хронологически неправдоподобное ребро.
 */
function breakCycles(archive: ValidatedArchive): void {
  for (let guard = 0; guard < 200; guard += 1) {
    const cyclic: Array<{ parent: ValidatedPerson; childId: string; score: number }> = [];
    archive.people.forEach((person) => {
      person.childIds.forEach((childId) => {
        if (!descendsFrom(archive, person.personId, childId)) return;
        const child = archive.people.get(childId);
        if (!child) return;
        const score = person.birthYear !== null && child.birthYear !== null ? person.birthYear - child.birthYear : 0;
        cyclic.push({ parent: person, childId, score });
      });
    });
    if (cyclic.length === 0) return;
    cyclic.sort((a, b) => b.score - a.score || (a.parent.personId > b.parent.personId ? 1 : -1));
    const worst = cyclic[0];
    const child = archive.people.get(worst.childId);
    if (!child) return;
    worst.parent.childIds = worst.parent.childIds.filter((c) => c !== worst.childId);
    child.parentIds = child.parentIds.filter((p) => p !== worst.parent.personId);
    issue(archive, "Люди", 0, worst.parent.personId, "REL_CYCLE", `Связь родитель→ребёнок ${worst.parent.personId}>${worst.childId} создаёт цикл поколений и исключена.`);
  }
}

function descendsFrom(archive: ValidatedArchive, ancestor: string, current: string): boolean {
  const queue = [current];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (id === ancestor) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const person = archive.people.get(id);
    if (person) queue.push(...person.childIds);
  }
  return false;
}

/**
 * Поколения: корни (без родителей) = 1; ребёнок = max(родители) + 1.
 * Супруги выравниваются: вошедший в род по браку (без родителей в данных)
 * встаёт в поколение партнёра — иначе пара уезжает в первый ряд древа,
 * хотя партнёр — сын/дочь своих родителей. Брачный «пол» поколения
 * учитывается кровным расчётом, дети подтягиваются за поднявшимся родителем.
 */
function computeGenerations(archive: ValidatedArchive): void {
  const spouseFloor = new Map<string, number>();
  const applyBlood = (): void => {
    const resolved = new Map<string, number>();
    const resolving = new Set<string>();
    const resolve = (personId: string): number => {
      const cached = resolved.get(personId);
      if (cached !== undefined) return cached;
      if (resolving.has(personId)) return 0;
      resolving.add(personId);
      const person = archive.people.get(personId);
      let generation = spouseFloor.get(personId) ?? 1;
      if (person && person.parentIds.length > 0) {
        generation = Math.max(generation, 1 + Math.max(...person.parentIds.map((parentId) => resolve(parentId))));
      }
      resolving.delete(personId);
      resolved.set(personId, generation);
      return generation;
    };
    archive.people.forEach((person) => {
      person.generation = resolve(person.personId);
    });
  };

  applyBlood();
  for (let pass = 0; pass <= archive.people.size; pass += 1) {
    let changed = false;
    archive.people.forEach((person) => {
      person.spouseIds.forEach((spouseId) => {
        const spouse = archive.people.get(spouseId);
        if (!spouse) return;
        const target = Math.max(person.generation, spouse.generation);
        [person.personId, spouseId].forEach((id) => {
          if (target > (spouseFloor.get(id) ?? 1)) {
            spouseFloor.set(id, target);
            changed = true;
          }
        });
        person.generation = target;
        spouse.generation = target;
      });
    });
    if (!changed) break;
    applyBlood();
  }

  archive.people.forEach((person) => {
    person.parentIds.forEach((parentId) => {
      const parent = archive.people.get(parentId);
      if (parent && person.generation <= parent.generation) {
        issue(archive, "Люди", 0, person.personId, "PERSON_GENERATION_CONFLICT", `Поколение человека № ${person.personId.slice(2)} не больше поколения родителя — проверьте связи.`);
      }
    });
  });

  // Дети одного родителя должны попадать в одно поколение. Расхождение почти
  // всегда означает случайную связь «Супруг(а)»: супруг со своим рядом
  // (пары выравниваются по максимуму) уводит человека на ряд ниже родных.
  const reported = new Set<string>();
  const childrenByParent = new Map<string, ValidatedPerson[]>();
  archive.people.forEach((person) => {
    person.parentIds.forEach((parentId) => {
      const bucket = childrenByParent.get(parentId) ?? [];
      bucket.push(person);
      childrenByParent.set(parentId, bucket);
    });
  });
  childrenByParent.forEach((children, parentId) => {
    const siblingGeneration = Math.min(...children.map((child) => child.generation));
    children.forEach((child) => {
      if (child.generation > siblingGeneration && !reported.has(child.personId)) {
        reported.add(child.personId);
        issue(
          archive,
          "Люди",
          0,
          child.personId,
          "PERSON_SIBLING_GENERATION_MISMATCH",
          `Человек № ${child.personId.slice(2)} попал в поколение ${child.generation}, а родные братья и сёстры — в ${siblingGeneration}. Обычно причина — случайная связь «Супруг(а)» у него или у партнёра (родитель № ${parentId.slice(2)}).`
        );
      }
    });
  });
}

/**
 * Ветви из значений колонки «Ветвь»: branchId = подпись.
 * Первыми идут ветви корневых людей (общие предки) — фильтр древа всегда их сохраняет.
 */
function buildBranches(archive: ValidatedArchive): ValidatedBranch[] {
  const order: string[] = [];
  const push = (label: string) => {
    const trimmed = label.trim();
    if (trimmed && !order.includes(trimmed)) order.push(trimmed);
  };
  const sorted = Array.from(archive.people.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  sorted.forEach((person) => {
    if (person.parentIds.length === 0) push(person.branchId);
  });
  sorted.forEach((person) => push(person.branchId));
  return order.map((label, index) => ({ branchId: label, label, sortOrder: index + 1 }));
}

function validateEvents(raw: RawRecords, archive: ValidatedArchive, drafts: Map<number, PersonDraft>): void {
  const sheet = "События";
  raw.events.forEach((row) => {
    if (isBlank(row.title)) return;
    if (normalizeBool(row.draft) === true) return;

    const type = normalizeEventType(row.type);
    if (type === "INVALID") {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_BAD_TYPE", "«Тип»: Семейное или Историческое.");
      return;
    }
    const visibility = normalizeVisibility(row.visibility);
    if (visibility !== "PUBLIC" && visibility !== "FAMILY") {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_BAD_VISIBILITY", "«Видимость»: Публичное или Семейное.");
      return;
    }
    const start = parseFlexibleDate(row.date);
    if (start === null || start.year === null) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_BAD_DATE", "Нужна хотя бы дата-год в колонке «Дата».");
      return;
    }
    const end = parseFlexibleDate(row.endDate);
    if (end === null) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_BAD_END_DATE", `Некорректное «Конец»: ${toText(row.endDate)}.`);
      return;
    }
    if (end.year !== null && end.sortKey < start.sortKey) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_END_BEFORE_START", "«Конец» предшествует «Дата».");
      return;
    }
    let primaryPersonId: string | null = null;
    const personRef = parseRefNumber(row.person);
    if (personRef === -1) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "PERSON_BAD_REF", "Колонка «Человек»: выберите значение из списка.");
    } else if (personRef !== null) {
      const draft = drafts.get(personRef);
      if (!draft) {
        issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "PERSON_UNKNOWN_REF", `Человек с № ${personRef} не найден.`);
      } else {
        primaryPersonId = draft.person.personId;
      }
    }

    archive.events.push({
      eventId: padId("e", row.rowNumber),
      eventType: type,
      title: toText(row.title),
      displayDate: toText(row.displayDate) || (end.year !== null ? `${start.year}–${end.year}` : String(start.year)),
      startSortKey: start.sortKey,
      precision: start.precision,
      publicDescription: visibility === "PUBLIC" ? toText(row.description) : "",
      familyDescription: visibility === "FAMILY" ? toText(row.description) : "",
      visibility,
      primaryPersonId,
      sortOrder: row.rowNumber
    });
  });
  archive.events.sort((a, b) => a.startSortKey - b.startSortKey || a.sortOrder - b.sortOrder || a.eventId.localeCompare(b.eventId));
}

function validateMaterials(raw: RawRecords, archive: ValidatedArchive, drafts: Map<number, PersonDraft>): void {
  const sheet = "Материалы";
  raw.materials.forEach((row) => {
    if (isBlank(row.title)) return;
    if (normalizeBool(row.draft) === true) return;

    const visibility = normalizeVisibility(row.visibility);
    if (visibility !== "PUBLIC" && visibility !== "FAMILY") {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_BAD_VISIBILITY", "«Видимость»: Публичное или Семейное.");
      return;
    }

    const sourceUrl = toText(row.sourceUrl);
    const assetPath = toText(row.assetPath);
    const category = normalizeCategory(row.category);
    let storage: MediaStorage;
    let driveFileId: string | null = null;
    let externalUrl: string | null = null;
    if (sourceUrl && isDriveUrl(sourceUrl)) {
      const driveId = extractDriveFileId(sourceUrl);
      if (!driveId) {
        issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_BAD_DRIVE_URL", "Не удалось извлечь ID файла из ссылки Drive (нужна ссылка на файл, не на папку).");
        return;
      }
      if (category === "documents") {
        // Документы из Drive остаются закрытыми: сервер читает файл сам и отдаёт только семье.
        storage = "DRIVE";
        driveFileId = driveId;
      } else {
        // Фото — единообразная публичная ссылка: файлу нужен доступ «по ссылке».
        storage = "DRIVE_PUBLIC";
        externalUrl = driveImageUrl(driveId, 1200);
      }
    } else if (sourceUrl) {
      if (!isSafeExternalUrl(sourceUrl)) {
        issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_UNSAFE_URL", "«Ссылка» должна начинаться с https://");
        return;
      }
      storage = "EXTERNAL";
      externalUrl = sourceUrl;
    } else if (assetPath) {
      if (!isSafeAssetPath(assetPath)) {
        issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_BAD_ASSET_PATH", "«Локальный путь» допускает только assets/… или media/public/…");
        return;
      }
      storage = "PUBLIC_ASSET";
    } else {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_NO_SOURCE", "Нужна «Ссылка» (Drive/https) или «Локальный путь».");
      return;
    }

    const isPdf = /\.pdf(\?|$)/i.test(sourceUrl) || /\.pdf$/i.test(assetPath);
    const mimeType = isPdf
      ? "application/pdf"
      : storage === "PUBLIC_ASSET" && assetPath.endsWith(".svg")
        ? "image/svg+xml"
        : "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_BAD_MIME", "Недопустимый тип файла.");
      return;
    }

    const sortKey = parseFlexibleDate(row.date)?.year ?? 0;
    const mediaId = padId("m", row.rowNumber);
    archive.media.set(mediaId, {
      mediaId,
      title: toText(row.title),
      category,
      mediaType: isPdf ? "document" : "image",
      visibility,
      storage,
      assetPath: storage === "PUBLIC_ASSET" ? assetPath : null,
      driveFileId,
      externalUrl,
      mimeType,
      dateDisplay: toText(row.date),
      sortKey,
      altText: toText(row.title),
      publicCaption: visibility === "PUBLIC" ? toText(row.caption) : "",
      familyCaption: toText(row.caption),
      width: null,
      height: null,
      sortOrder: row.rowNumber
    });

    const personRef = parseRefNumber(row.person);
    if (personRef === -1) {
      issue(archive, sheet, row.rowNumber, mediaId, "PERSON_BAD_REF", "Колонка «Чей материал»: выберите значение из списка.");
    } else if (personRef !== null) {
      const draft = drafts.get(personRef);
      if (!draft) {
        issue(archive, sheet, row.rowNumber, mediaId, "PERSON_UNKNOWN_REF", `Человек с № ${personRef} не найден.`);
      } else {
        archive.personMaterials.push({
          personId: draft.person.personId,
          mediaId,
          role: normalizeRole(row.role),
          sortOrder: row.rowNumber
        });
      }
    }
  });
}
