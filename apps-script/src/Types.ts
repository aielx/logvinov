/**
 * Общие типы данных архива (схема v2).
 * Редакторы заполняют три простые вкладки; технических ID в таблице нет —
 * сервер назначает personId/mediaId/eventId по номеру строки.
 */

export type RowStatus = "DRAFT" | "PUBLISHED";
export type Visibility = "PUBLIC" | "FAMILY";
export type EventType = "FAMILY" | "HISTORY";
export type MediaCategory = "archive" | "documents" | "portraits";
export type MediaStorage = "PUBLIC_ASSET" | "DRIVE" | "EXTERNAL";
export type DatePrecision = "YEAR" | "MONTH" | "DAY";
export type MaterialRole = "PORTRAIT" | "GALLERY" | "SOURCE";

/** Прикладная ошибка API: превращается в JSON-конверт с прикладным кодом. */
export class ApiFailure {
  constructor(
    status: number,
    code: string,
    message: string,
    retryable: boolean = false,
    retryAfterSeconds?: number
  ) {
    this.status = status;
    this.code = code;
    this.message = message;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}

/** Событие Web App (doGet/doPost): параметр содержит query + urlencoded-тело. */
export interface HttpEvent {
  parameter: Record<string, string>;
  postData?: { contents: string; type: string };
}

/** Строка вкладки «Люди» — как заполнил редактор. Связи — по № человека. */
export interface PersonRow {
  rowNumber: number;
  /** Стабильный номер человека (колонка «№»); API превращает его в p_00NN. */
  number: string;
  fullName: string;
  birthDate: string;
  deathDate: string;
  isLiving: string;
  branch: string;
  /** Значение вида "3 · Иван Иванович Логвинов" или просто "3". */
  father: string;
  mother: string;
  spouse: string;
  publicBio: string;
  familyBio: string;
  publicBirthPlace: string;
  familyBirthPlace: string;
  familyContacts: string;
  familyNotes: string;
  photo: string;
  cardVisibility: string;
  draft: string;
}

/** Строка вкладки «События». */
export interface EventRow {
  rowNumber: number;
  date: string;
  endDate: string;
  displayDate: string;
  title: string;
  description: string;
  type: string;
  visibility: string;
  person: string;
  draft: string;
}

/** Строка вкладки «Материалы». */
export interface MaterialRow {
  rowNumber: number;
  title: string;
  caption: string;
  date: string;
  category: string;
  visibility: string;
  sourceUrl: string;
  assetPath: string;
  person: string;
  role: string;
  draft: string;
}

/** Сырые записи до валидации. */
export interface RawRecords {
  people: PersonRow[];
  events: EventRow[];
  materials: MaterialRow[];
  schemaErrors: SchemaError[];
}

export interface SchemaError {
  sheet: string;
  message: string;
}

/** Проблема отдельной записи: попадает только в закрытый отчёт для редакторов. */
export interface DataIssue {
  sheet: string;
  rowNumber: number;
  recordId: string;
  code: string;
  message: string;
}

export interface ParsedDate {
  year: number | null;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
  sortKey: number;
}

export interface ValidatedPerson {
  personId: string;
  displayName: string;
  isLiving: boolean;
  branchId: string;
  /** Текстовые поля из листа «Люди» (сервер сам решает, что публиковать). */
  publicBio: string;
  familyBio: string;
  publicBirthPlace: string;
  familyBirthPlace: string;
  familyContacts: string;
  familyNotes: string;
  birthYear: number | null;
  deathYear: number | null;
  birthDate: ParsedDate | null;
  deathDate: ParsedDate | null;
  /** PUBLIC | FAMILY — вычисленное правило видимости подробной карточки. */
  detailsVisibility: Visibility;
  publicAvatarUrl: ResolvedPhoto | null;
  sortOrder: number;
  generation: number;
  parentIds: string[];
  spouseIds: string[];
  childIds: string[];
}

export interface ResolvedPhoto {
  storage: "PUBLIC_ASSET" | "EXTERNAL" | "DRIVE_PUBLIC";
  path?: string;
  url?: string;
}

export interface ValidatedEvent {
  eventId: string;
  eventType: EventType;
  title: string;
  displayDate: string;
  startSortKey: number;
  precision: DatePrecision;
  publicDescription: string;
  familyDescription: string;
  visibility: Visibility;
  primaryPersonId: string | null;
  sortOrder: number;
}

export interface ValidatedMedia {
  mediaId: string;
  title: string;
  category: MediaCategory;
  mediaType: string;
  visibility: Visibility;
  storage: MediaStorage;
  assetPath: string | null;
  driveFileId: string | null;
  externalUrl: string | null;
  mimeType: string;
  dateDisplay: string;
  sortKey: number;
  altText: string;
  publicCaption: string;
  familyCaption: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
}

export interface ValidatedPersonMaterial {
  personId: string;
  mediaId: string;
  role: MaterialRole;
  sortOrder: number;
}

export interface ValidatedBranch {
  branchId: string;
  label: string;
  sortOrder: number;
}

export interface ValidatedArchive {
  schemaVersion: string;
  dataRevision: string;
  people: Map<string, ValidatedPerson>;
  events: ValidatedEvent[];
  media: Map<string, ValidatedMedia>;
  personMaterials: ValidatedPersonMaterial[];
  branches: ValidatedBranch[];
  issues: DataIssue[];
  degraded: boolean;
}
