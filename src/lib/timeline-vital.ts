/**
 * Витальные события хронологии: автособытия рождений и смертей (kind из API)
 * группируются по году в компактные строки, остальные события остаются карточками.
 * Модуль чистый — без DOM, покрыт unit-тестами.
 */
import type { PublicTimelineEvent } from "./api/types";
import { formatSoftDate } from "./dates";

/** Событие в store: публичное или семейное (появляется только после входа). */
export type TimelineEvent = PublicTimelineEvent & { familyOnly?: boolean };

export type VitalKind = "BIRTH" | "DEATH";

export interface VitalMember {
  personId: string;
  name: string;
  familyOnly: boolean;
}

export interface VitalGroup {
  kind: VitalKind;
  /** Дата первого участника группы: позиция в ленте и <time datetime>. */
  date: string;
  sortKey: number;
  members: VitalMember[];
  familyOnly: boolean;
}

export interface TimelineEntry {
  type: "event" | "vital";
  event?: TimelineEvent;
  group?: VitalGroup;
  sortKey: number;
}

export function isVitalKind(kind: unknown): kind is VitalKind {
  return kind === "BIRTH" || kind === "DEATH";
}

/** Генеалогические маркеры: * — рождение, † — смерть. */
export function vitalMarker(kind: VitalKind): string {
  return kind === "BIRTH" ? "*" : "†";
}

export function vitalLabel(kind: VitalKind): string {
  return kind === "BIRTH" ? "День рождения" : "День памяти";
}

/**
 * Разделение ленты: обычные события как есть, витальные — группами «вид + год».
 * Один год с несколькими рождениями собирается в одну строку с перечнем имён.
 */
export function buildTimelineEntries(events: TimelineEvent[]): TimelineEntry[] {
  const regular: TimelineEntry[] = [];
  const groups = new Map<string, VitalGroup>();
  events.forEach((event) => {
    if (!isVitalKind(event.kind)) {
      regular.push({ type: "event", event, sortKey: event.sortKey });
      return;
    }
    const year = Math.floor(event.sortKey / 10000);
    const key = `${event.kind}:${year}`;
    const group = groups.get(key);
    if (group) {
      group.members.push({ personId: event.primaryPersonId ?? "", name: event.title, familyOnly: event.familyOnly === true });
      group.familyOnly = group.familyOnly || event.familyOnly === true;
    } else {
      groups.set(key, {
        kind: event.kind,
        date: event.date,
        sortKey: event.sortKey,
        members: [{ personId: event.primaryPersonId ?? "", name: event.title, familyOnly: event.familyOnly === true }],
        familyOnly: event.familyOnly === true
      });
    }
  });
  const vital: TimelineEntry[] = [...groups.values()].map((group) => ({ type: "vital" as const, group, sortKey: group.sortKey }));
  // Дата; при равенстве ручные события идут раньше автогрупп, детерминизм — по представителю.
  return [...regular, ...vital].sort((a, b) => a.sortKey - b.sortKey || rank(a) - rank(b) || idOf(a).localeCompare(idOf(b)));
}

function rank(entry: TimelineEntry): number {
  return entry.type === "vital" ? 1 : 0;
}

function idOf(entry: TimelineEntry): string {
  return entry.type === "vital" ? entry.group?.members[0]?.personId ?? "" : entry.event?.eventId ?? "";
}

/** Отображение даты витальной строки: год как есть, точные даты по-русски. */
export function vitalDateLabel(date: string): string {
  if (/^\d{4}$/.test(date)) return date;
  return formatSoftDate(date) || date;
}
