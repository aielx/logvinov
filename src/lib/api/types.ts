/**
 * Типы контракта Apps Script API (версия 1).
 * Публичные типы содержат только разрешённые поля (см. apps-script/src/PublicSerializer.ts).
 */

export type MediaCategory = "archive" | "documents" | "portraits";
export type MediaStorage = "PUBLIC_ASSET" | "DRIVE" | "EXTERNAL" | "DRIVE_PUBLIC";
export type EventType = "FAMILY" | "HISTORY";
export type RelationRole = "parent" | "spouse" | "child";

export interface ApiEnvelopeMeta {
  dataRevision: string;
  generatedAt: string;
}

export interface ApiOk<T> {
  ok: true;
  apiVersion: string;
  requestId: string;
  data: T;
  meta: ApiEnvelopeMeta;
}

export interface ApiErrorPayload {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}

export interface ApiErr {
  ok: false;
  apiVersion: string;
  requestId: string;
  error: ApiErrorPayload;
}

export type ApiEnvelope<T> = ApiOk<T> | ApiErr;

// --- Публичное древо -------------------------------------------------------

export interface PublicAvatar {
  storage: MediaStorage;
  path?: string;
  url?: string;
}

export interface PublicBranch {
  branchId: string;
  label: string;
  sortOrder: number;
}

export interface PublicTreePerson {
  personId: string;
  displayName: string;
  birthYear: number | null;
  deathYear: number | null;
  isLiving: boolean;
  branchId: string;
  generation: number;
  sortOrder: number;
  years: string;
  parentIds: string[];
  spouseIds: string[];
  childIds: string[];
  hasPublicDetails: boolean;
  avatar: PublicAvatar | null;
}

export interface PublicTree {
  schemaVersion: string;
  branches: PublicBranch[];
  people: PublicTreePerson[];
}

// --- Публичная карточка ----------------------------------------------------

export interface PublicRelative {
  personId: string;
  displayName: string;
  years: string;
  isLiving: boolean;
  relation: RelationRole;
}

export interface PublicMaterial {
  mediaId: string;
  title: string;
  category: MediaCategory;
  role: string;
  dateDisplay: string;
  altText: string;
  caption: string;
  mediaType: string;
  storage: MediaStorage;
  path: string | null;
  url: string | null;
}

export interface PublicPersonCard {
  personId: string;
  displayName: string;
  years: string;
  generation: number;
  branchId: string;
  branchLabel: string | null;
  bio: string;
  birthPlace: string;
  birth: { date: string | null; precision: string; year: number | null } | null;
  death: { date: string | null; precision: string; year: number | null } | null;
  avatar: PublicAvatar | null;
  relatives: PublicRelative[];
  materials: PublicMaterial[];
}

// --- Хронология ------------------------------------------------------------

export interface PublicTimelineEvent {
  eventId: string;
  eventType: EventType;
  title: string;
  date: string;
  sortKey: number;
  description: string;
  primaryPersonId: string | null;
}

// --- Галерея ---------------------------------------------------------------

export interface PublicGalleryItem {
  mediaId: string;
  title: string;
  category: MediaCategory;
  mediaType: string;
  dateDisplay: string;
  altText: string;
  caption: string;
  storage: MediaStorage;
  path: string | null;
  url: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
}

export interface PublicGalleryPage {
  items: PublicGalleryItem[];
  nextCursorOffset: number | null;
}

// --- Приватные ответы (только дополнительные поля) --------------------------

export interface PrivatePerson {
  personId: string;
  bio: string;
  birth: { date: string | null; precision: string } | null;
  birthPlace: string;
  contacts: string;
  notes: string;
  materials: Array<{
    mediaId: string;
    title: string;
    category: MediaCategory;
    role: string;
    dateDisplay: string;
    altText: string;
    caption: string;
    mediaType: string;
    mimeType: string;
    storage: MediaStorage;
    url: string | null;
  }>;
}

export type PrivateTimelineEvent =
  | (PublicTimelineEvent & { familyDescription?: undefined })
  | { eventId: string; familyDescription: string };

export interface PrivateGalleryItem {
  mediaId: string;
  title: string;
  category: MediaCategory;
  mediaType: string;
  dateDisplay: string;
  altText: string;
  caption: string;
  mimeType: string;
  storage: MediaStorage;
  url: string | null;
  width: number | null;
  height: number | null;
}

export type PrivateMediaPayload =
  | { mediaId: string; storage: "EXTERNAL"; url: string; mimeType: string }
  | { mediaId: string; storage: "PUBLIC_ASSET"; path: string; mimeType: string }
  | { mediaId: string; storage: "DRIVE"; fileName: string; mimeType: string; byteSize: number; base64: string };

export interface LoginResult {
  token: string;
  createdAt: string;
}

export interface HealthResult {
  status: string;
  schemaVersion: string;
  dataRevision: string;
}
