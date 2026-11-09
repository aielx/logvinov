/**
 * Фикстура v2: демо-данные из Seed.ts как значения вкладок «Люди/События/Материалы».
 * Используется серверными тестами и локальным contract-mock API для e2e.
 */
import { DEMO } from "../src/Seed";
import { HEADERS, SHEETS } from "../src/Config";

export function demoSheetValues(): Record<string, unknown[][]> {
  return {
    [SHEETS.PEOPLE]: [HEADERS[SHEETS.PEOPLE], ...clone(DEMO.people)],
    [SHEETS.EVENTS]: [HEADERS[SHEETS.EVENTS], ...clone(DEMO.events)],
    [SHEETS.MATERIALS]: [HEADERS[SHEETS.MATERIALS], ...clone(DEMO.materials)]
  };
}

function clone(rows: readonly (readonly unknown[])[]): unknown[][] {
  return rows.map((row) => [...row]);
}

/** Все закрытые canary-строки демо-датасета: их не должно быть в публичных ответах. */
export const CANARY_STRINGS = [
  "CANARY p0006",
  "CANARY p0008",
  "CANARY p0010",
  "CANARY e1978",
  "CANARY m0100",
  "CANARY m0101",
  "CANARY m0102",
  "CANARYDRIVEFILEID0001",
  "CANARYDRIVEFILEID0002"
];
