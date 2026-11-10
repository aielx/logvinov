/**
 * «В этот день»: годовщины событий с известным днём (dayKey «MM-DD» из API).
 * Модуль чистый — без DOM, покрыт unit-тестами; рендерит контроллер лендинга.
 *
 * Правила:
 *  - участвуют только события с dayKey (точность «день»);
 *  - сегодня: совпадение месяц+день по местной дате посетителя;
 *  - если сегодня пусто — ближайшая годовщина вперёд («Скоро в роду»);
 *  - годы рождения/события берутся из sortKey (floor(sortKey / 10000)).
 */
import type { PublicTimelineEvent } from "./api/types";

export type OnThisDayEvent = PublicTimelineEvent & { familyOnly?: boolean };

export type AnniversaryKind = "BIRTH" | "DEATH" | "EVENT";

export interface AnniversaryItem {
  event: OnThisDayEvent;
  kind: AnniversaryKind;
  /** Сколько лет исполняется годовщине (в наступающем году для «скоро»). */
  years: number;
  /** Дней до годовщины: 0 — сегодня. */
  daysUntil: number;
}

export interface OnThisDayResult {
  /** Годовщины сегодняшнего дня; пусто — показываем upcoming. */
  today: AnniversaryItem[];
  /** Ближайшая дата, когда сегодня ничего нет. */
  upcoming: AnniversaryItem | null;
}

const DAY_MS = 86_400_000;

/** Русская плюрализация лет: pluralYears(21) → «год», (22) → «года», (25) → «лет». */
export function pluralYears(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "лет";
  if (mod10 === 1) return "год";
  if (mod10 >= 2 && mod10 <= 4) return "года";
  return "лет";
}

function anniversaryKind(event: OnThisDayEvent): AnniversaryKind {
  if (event.kind === "BIRTH" || event.kind === "DEATH") return event.kind;
  return "EVENT";
}

function eventYear(event: OnThisDayEvent): number {
  return Math.floor(event.sortKey / 10000);
}

/** «12 июня» по dayKey; месяц — по-русски, в родительном падеже. */
export function dayKeyLabel(dayKey: string): string {
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const match = /^(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return "";
  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  if (month < 1 || month > 12) return "";
  return `${day} ${months[month - 1]}`;
}

interface Candidate {
  event: OnThisDayEvent;
  kind: AnniversaryKind;
  month: number;
  day: number;
  year: number;
}

function candidates(events: OnThisDayEvent[]): Candidate[] {
  return events.flatMap((event) => {
    const match = /^(\d{2})-(\d{2})$/.exec(event.dayKey ?? "");
    if (!match) return [];
    const month = Number.parseInt(match[1], 10);
    const day = Number.parseInt(match[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return [];
    return [{ event, kind: anniversaryKind(event), month, day, year: eventYear(event) }];
  });
}

/** Следующее наступление месяц+день не раньше today; дни считаются по UTC-полуночи. */
function daysUntil(month: number, day: number, today: Date): { days: number; occurrenceYear: number } {
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = 0; i <= 1; i += 1) {
    const occurrence = new Date(Date.UTC(today.getFullYear() + i, month - 1, day));
    const days = Math.round((occurrence.getTime() - todayUtc) / DAY_MS);
    if (days >= 0) return { days, occurrenceYear: today.getFullYear() + i };
  }
  // Недостижимо: двух итераций хватает любому 29 февраля.
  return { days: 0, occurrenceYear: today.getFullYear() };
}

/** Порядок в карточке: рождения, затем события, затем дни памяти; дальше по возрасту даты. */
const KIND_RANK: Record<AnniversaryKind, number> = { BIRTH: 0, EVENT: 1, DEATH: 2 };

export function selectOnThisDay(events: OnThisDayEvent[], today: Date): OnThisDayResult {
  const pool = candidates(events);
  const todayKey = (today.getMonth() + 1) * 100 + today.getDate();

  const todayItems: AnniversaryItem[] = pool
    .filter((item) => item.month * 100 + item.day === todayKey)
    .map((item) => ({ event: item.event, kind: item.kind, years: today.getFullYear() - item.year, daysUntil: 0 }))
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.event.sortKey - b.event.sortKey);

  if (todayItems.length > 0) return { today: todayItems, upcoming: null };

  let upcoming: AnniversaryItem | null = null;
  pool.forEach((item) => {
    const { days, occurrenceYear } = daysUntil(item.month, item.day, today);
    const candidateItem: AnniversaryItem = { event: item.event, kind: item.kind, years: occurrenceYear - item.year, daysUntil: days };
    if (
      upcoming === null ||
      candidateItem.daysUntil < upcoming.daysUntil ||
      (candidateItem.daysUntil === upcoming.daysUntil && candidateItem.event.sortKey < upcoming.event.sortKey)
    ) {
      upcoming = candidateItem;
    }
  });
  return { today: [], upcoming };
}

/** Подпись строки: «исполняется 51 год» (живому), «105 лет со дня рождения»,
 *  «день памяти — 71 год», «80 лет с события». */
export function anniversaryDetail(item: AnniversaryItem, options: { living?: boolean } = {}): string {
  const years = `${item.years} ${pluralYears(item.years)}`;
  if (item.kind === "BIRTH") {
    return options.living ? `исполняется ${years}` : `${years} со дня рождения`;
  }
  if (item.kind === "DEATH") return `день памяти — ${years}`;
  return `${years} с события`;
}
