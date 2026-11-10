/**
 * Чистые утилиты: даты, хеши, ID, URL. Не касаются сервисов Apps Script
 * (кроме тонких обёрток Utilities), поэтому полностью покрываются unit-тестами.
 */
import { DatePrecision, ParsedDate } from "./Types";

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

export function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Sheets часто сам превращает ввод «09.11.1984» в настоящий Date.
  // Приводим его к канонической строке YYYY-MM-DD (локальные компоненты даты,
  // без сдвига часовых поясов — скрипт таблицы живёт в её же часовом поясе).
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).trim();
}

export function toInt(value: unknown, fallback: number): number {
  const text = toText(value);
  if (text === "") return fallback;
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = toText(value).toUpperCase();
  if (["TRUE", "ДА", "YES", "1", "+"].includes(text)) return true;
  if (["FALSE", "НЕТ", "NO", "0", "-", ""].includes(text)) return false;
  return null;
}

/**
 * Разбор дат: YYYY, YYYY-MM, YYYY-MM-DD, русский ДД.ММ.ГГГГ — и «настоящие»
 * даты Sheets (объекты Date, в которые редактор превращает ввод «09.11.1984»).
 * Возвращает null, если непустое значение не удалось разобрать.
 */
export function parseFlexibleDate(raw: unknown): ParsedDate | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const year = raw.getFullYear();
    const month = raw.getMonth() + 1;
    const day = raw.getDate();
    return { year, month, day, precision: "DAY", sortKey: year * 10000 + month * 100 + day };
  }
  const text = toText(raw);
  if (text === "") {
    return { year: null, month: null, day: null, precision: "YEAR", sortKey: 0 };
  }
  // Русский формат ДД.ММ.ГГГГ (09.11.1984) — частая привычка редакторов.
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (dotted) {
    const day = parseInt(dotted[1], 10);
    const month = parseInt(dotted[2], 10);
    const year = parseInt(dotted[3], 10);
    if (year < 1000 || year > 2200) return null; // опечатки вида 09.11.0194
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { year, month, day, precision: "DAY", sortKey: year * 10000 + month * 100 + day };
  }
  const match = /^(\d{3,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  if (year < 1000 || year > 2200) return null;
  let month: number | null = null;
  let day: number | null = null;
  let precision: DatePrecision = "YEAR";
  if (match[2] !== undefined) {
    month = parseInt(match[2], 10);
    if (month < 1 || month > 12) return null;
    precision = "MONTH";
    if (match[3] !== undefined) {
      day = parseInt(match[3], 10);
      if (day < 1 || day > daysInMonth(year, month)) return null;
      precision = "DAY";
    }
  }
  return { year, month, day, precision, sortKey: year * 10000 + (month ?? 0) * 100 + (day ?? 0) };
}

/** Дней в месяце — для проверки дат вида 31.02. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Публичное отображение лет жизни: всегда только годы. */
export function formatYears(birthYear: number | null, deathYear: number | null, isLiving: boolean): string {
  if (birthYear === null) return "годы не уточнены";
  if (isLiving) return `${birthYear}–н. в.`;
  return deathYear === null ? String(birthYear) : `${birthYear}–${deathYear}`;
}

/**
 * Ключ годовщины «MM-DD» из sortKey (YYYYMMDD) — для блока «В этот день».
 * null, когда месяц или день не известны (точность «год»/«месяц»).
 */
export function dayKeyFromSortKey(sortKey: number): string | null {
  const month = Math.floor((sortKey % 10000) / 100);
  const day = sortKey % 100;
  if (month < 1 || day < 1) return null;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** ISO-представление разобранной даты: 1890 | 1890-05 | 1890-05-17. */
export function formatIsoDate(date: { year: number | null; month: number | null; day: number | null }): string | null {
  if (date.year === null) return null;
  const year = String(date.year);
  if (date.month === null) return year;
  const month = String(date.month).padStart(2, "0");
  if (date.day === null) return `${year}-${month}`;
  return `${year}-${month}-${String(date.day).padStart(2, "0")}`;
}

export function sha256Hex(value: string): string {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytesToHex(bytes);
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => ((b < 0 ? b + 256 : b) & 0xff).toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): number[] {
  const clean = hex.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  if (clean.length === 0 || clean.length % 2 !== 0) throw new Error("Некорректный hex");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

export function hmacSha256Bytes(value: number[] | string, key: number[] | string): number[] {
  const toSigned = (input: number[] | string): number[] =>
    (typeof input === "string" ? Array.from(Utilities.newBlob(input).getBytes()) : input).map((b: number) =>
      b > 127 ? b - 256 : b < 0 ? b + 256 : b
    );
  const raw = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_256,
    toSigned(value),
    toSigned(key)
  );
  return raw.map((b: number) => (b < 0 ? b + 256 : b));
}

export function randomToken(): string {
  // Два UUID без дефисов: 64 hex-символа = 256 бит энтропии.
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
}

export function randomRequestId(): string {
  return Utilities.getUuid();
}

export function nowIso(): string {
  return Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

/** Сравнение hex-строк за постоянное время. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Извлечение driveFileId из ссылок Google Drive. */
export function extractDriveFileId(rawUrl: string): string | null {
  const url = toText(rawUrl);
  if (url === "") return null;
  const patterns = [/\/file\/d\/([A-Za-z0-9_-]{10,})/, /[?&]id=([A-Za-z0-9_-]{10,})/];
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match) return match[1];
  }
  return null;
}

export function isDriveUrl(rawUrl: string): boolean {
  const url = toText(rawUrl);
  return /^https:\/\/(drive|docs)\.google\.com\//.test(url);
}

/**
 * Прямая ссылка-картинка на файл Drive с доступом «по ссылке».
 * endpoint thumbnail надёжнее uc?export=view для <img> и умеет сжатие по ширине.
 */
export function driveImageUrl(fileId: string, maxWidth: number): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${maxWidth}`;
}

/** Внешние ссылки: только HTTPS, без управляющих символов и пробелов. */
export function isSafeExternalUrl(rawUrl: string): boolean {
  const url = toText(rawUrl);
  return /^https:\/\/[^\s"'<>()]+$/i.test(url);
}

/** assetPath допускает только относительные пути внутри public/ сайта. */
export function isSafeAssetPath(rawPath: string): boolean {
  const path = toText(rawPath);
  if (path === "") return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(path)) return false;
  if (path.includes("..")) return false;
  return /^(assets|media\/public)\//.test(path);
}

/** Непрозрачный курсор пагинации: base64url JSON. */
export function encodeCursor(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return Utilities.base64Encode(json, Utilities.Charset.UTF_8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor<T = Record<string, unknown>>(cursor: string): T | null {
  const cleaned = toText(cursor).replace(/-/g, "+").replace(/_/g, "/");
  if (cleaned === "") return null;
  try {
    const json = Utilities.newBlob(Utilities.base64Decode(cleaned)).getDataAsString();
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
