/**
 * Автособытия хронологии: рождения и смерти выводятся из листа «Люди»,
 * чтобы даты не приходилось дублировать вручную в «Событиях».
 *
 * Видимость наследуется от человека по правилу подробной карточки
 * (умерший + не «Семейная» → публично; живой или «Семейная» → после входа).
 * Ручная строка «Событий» про того же человека с тем же годом глушит
 * автособытие — ручное описание всегда важнее.
 */
import { EventType, ValidatedArchive, ValidatedPerson, Visibility } from "./Types";
import { dayKeyFromSortKey, formatIsoDate } from "./Util";

export type VitalKind = "BIRTH" | "DEATH";

export interface VitalEvent {
  eventId: string;
  kind: VitalKind;
  title: string;
  /** ISO-представление: 1890 | 1890-05 | 1890-05-17. */
  date: string;
  sortKey: number;
  visibility: Visibility;
  primaryPersonId: string;
  /** «MM-DD», если известен точный день, — для блока «В этот день». */
  dayKey?: string;
}

/** Сериализованное событие ленты: у автособытий заполнен kind, у ручных — нет. */
export interface SerializedTimelineEvent {
  eventId: string;
  eventType: EventType;
  kind?: VitalKind;
  title: string;
  date: string;
  sortKey: number;
  description: string;
  primaryPersonId: string | null;
  /** «MM-DD» у событий с точным днём (рождения, смерти, памятные даты). */
  dayKey?: string;
}

/** Публичное автособытие — то же правило, что hasPublicDetails в public.tree. */
function isPublicVital(person: ValidatedPerson): boolean {
  return !person.isLiving && person.detailsVisibility === "PUBLIC";
}

/** Годы, уже описанные ручными строками «Событий»: «personId|год». */
function manualPersonYears(archive: ValidatedArchive): Set<string> {
  const years = new Set<string>();
  archive.events.forEach((event) => {
    if (!event.primaryPersonId) return;
    years.add(`${event.primaryPersonId}|${Math.floor(event.startSortKey / 10000)}`);
  });
  return years;
}

/** Сортировка витальных событий: по дате, затем детерминированно по id. */
function compareVital(a: VitalEvent, b: VitalEvent): number {
  return a.sortKey - b.sortKey || a.eventId.localeCompare(b.eventId);
}

function toTimelineEvent(vital: VitalEvent): SerializedTimelineEvent {
  return {
    eventId: vital.eventId,
    eventType: "FAMILY",
    kind: vital.kind,
    title: vital.title,
    date: vital.date,
    sortKey: vital.sortKey,
    description: "",
    primaryPersonId: vital.primaryPersonId,
    ...(vital.dayKey ? { dayKey: vital.dayKey } : {})
  };
}

/** Все автособытия рода (публичные и семейные); сериализаторы фильтруют сами. */
export function deriveVitalEvents(archive: ValidatedArchive): VitalEvent[] {
  const manualYears = manualPersonYears(archive);
  const result: VitalEvent[] = [];
  const push = (person: ValidatedPerson, kind: VitalKind, date: ValidatedPerson["birthDate"]): void => {
    if (!date || date.year === null) return;
    if (manualYears.has(`${person.personId}|${date.year}`)) return;
    const dayKey = date.precision === "DAY" ? dayKeyFromSortKey(date.sortKey) : null;
    result.push({
      eventId: `auto-${kind.toLowerCase()}-${person.personId}`,
      kind,
      title: person.displayName,
      date: formatIsoDate(date) ?? String(date.year),
      sortKey: date.sortKey,
      visibility: isPublicVital(person) ? "PUBLIC" : "FAMILY",
      primaryPersonId: person.personId,
      ...(dayKey ? { dayKey } : {})
    });
  };
  archive.people.forEach((person) => {
    push(person, "BIRTH", person.birthDate);
    push(person, "DEATH", person.deathDate);
  });
  return result.sort(compareVital);
}

/** Формат витального события для ответов API (единый для public и private). */
export function vitalTimelineEvent(vital: VitalEvent): SerializedTimelineEvent {
  return toTimelineEvent(vital);
}

/** Общий компаратор ленты: дата, ручные события раньше автособытий, затем id. */
export function compareTimelineEntries(a: SerializedTimelineEvent, b: SerializedTimelineEvent): number {
  const vitalRank = (entry: SerializedTimelineEvent): number => (entry.kind === undefined ? 0 : 1);
  return a.sortKey - b.sortKey || vitalRank(a) - vitalRank(b) || a.eventId.localeCompare(b.eventId);
}
