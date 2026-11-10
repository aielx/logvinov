import { describe, expect, it } from "vitest";
import {
  anniversaryDetail,
  dayKeyLabel,
  pluralYears,
  selectOnThisDay,
  type OnThisDayEvent
} from "../../../src/lib/on-this-day";

function vital(eventId: string, kind: "BIRTH" | "DEATH", title: string, iso: string, extra: Partial<OnThisDayEvent> = {}): OnThisDayEvent {
  const [year, month, day] = iso.split("-").map(Number);
  return {
    eventId,
    eventType: "FAMILY",
    kind,
    title,
    date: iso,
    sortKey: year * 10000 + (month ?? 0) * 100 + (day ?? 0),
    description: "",
    primaryPersonId: "p_0001",
    dayKey: month && day ? `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : undefined,
    ...extra
  };
}

function manual(eventId: string, title: string, iso: string, extra: Partial<OnThisDayEvent> = {}): OnThisDayEvent {
  const [year, month, day] = iso.split("-").map(Number);
  return {
    eventId,
    eventType: "FAMILY",
    title,
    date: String(year),
    sortKey: year * 10000 + (month ?? 0) * 100 + (day ?? 0),
    description: "",
    primaryPersonId: null,
    dayKey: month && day ? `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : undefined,
    ...extra
  };
}

describe("selectOnThisDay", () => {
  it("сегодня: совпадение месяц+день, годы считаются от года события", () => {
    const events = [
      vital("b1", "BIRTH", "Анна Сергеевна Логвинова", "1921-06-12"),
      vital("b2", "BIRTH", "Мария Ивановна Логвинова", "1895-03-08")
    ];
    const result = selectOnThisDay(events, new Date(2026, 5, 12));
    expect(result.today).toHaveLength(1);
    expect(result.today[0].event.eventId).toBe("b1");
    expect(result.today[0].years).toBe(105);
    expect(result.today[0].daysUntil).toBe(0);
    expect(result.upcoming).toEqual([]);
  });

  it("сегодня несколько дат: рождения раньше событий, события раньше дней памяти", () => {
    const events = [
      vital("d1", "DEATH", "Иван Петрович Логвинов", "1955-02-24"),
      manual("m1", "Брак Ивана и Анны", "1946-02-24"),
      vital("b1", "BIRTH", "Анна Сергеевна Логвинова", "1921-02-24")
    ];
    const result = selectOnThisDay(events, new Date(2026, 1, 24));
    expect(result.today.map((item) => item.event.eventId)).toEqual(["b1", "m1", "d1"]);
  });

  it("события без dayKey (точность год/месяц) не участвуют", () => {
    const events = [
      vital("y1", "BIRTH", "Пётр Иванович", "1922"),
      vital("m2", "BIRTH", "Екатерина Андреевна", "1926-09"),
      manual("bad", "Событие", "1917", { dayKey: "13-45" })
    ];
    const result = selectOnThisDay(events, new Date(2026, 8, 1));
    expect(result.today).toHaveLength(0);
    expect(result.upcoming).toEqual([]);
  });

  it("пусто сегодня: ближайшая дата вперёд с годами наступающей годовщины", () => {
    const events = [
      vital("b1", "BIRTH", "Анна Сергеевна Логвинова", "1921-06-12"),
      manual("m1", "Брак Ивана и Анны", "1946-07-20")
    ];
    const result = selectOnThisDay(events, new Date(2026, 6, 16));
    expect(result.today).toHaveLength(0);
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]?.event.eventId).toBe("m1");
    expect(result.upcoming[0]?.daysUntil).toBe(4);
    expect(result.upcoming[0]?.years).toBe(80);
  });

  it("ближайшая через границу года: декабрь → январь следующего года", () => {
    const events = [vital("b1", "BIRTH", "Анна Сергеевна Логвинова", "1921-01-04")];
    const result = selectOnThisDay(events, new Date(2026, 11, 30));
    expect(result.upcoming[0]?.daysUntil).toBe(5);
    expect(result.upcoming[0]?.years).toBe(106);
  });

  it("ближайшая дата: все её события по порядку, без более поздних", () => {
    const events = [
      vital("late", "BIRTH", "Поздний", "1980-07-22"),
      manual("event", "Семейное событие", "1946-07-22"),
      vital("death", "DEATH", "День памяти", "1955-07-22"),
      vital("early", "BIRTH", "Ранний", "1920-07-22"),
      vital("next", "BIRTH", "Следующий", "1920-07-23")
    ];
    const result = selectOnThisDay(events, new Date(2026, 6, 20));
    expect(result.upcoming.map((item) => item.event.eventId)).toEqual(["early", "late", "event", "death"]);
    expect(result.upcoming.every((item) => item.daysUntil === 2)).toBe(true);
  });

  it("семейный флаг сохраняется в выбранных строках", () => {
    const events = [vital("b8", "BIRTH", "Алексей Сергеевич Логвинов", "1975-09-05", { familyOnly: true })];
    const result = selectOnThisDay(events, new Date(2026, 8, 5));
    expect(result.today[0].event.familyOnly).toBe(true);
  });
});

describe("подписи", () => {
  it("anniversaryDetail склоняет годы по-русски для каждого типа", () => {
    const birth = { event: manual("e", "x", "1921-06-12"), kind: "BIRTH" as const, years: 105, daysUntil: 0 };
    const death21 = { event: manual("e", "x", "1955-02-24"), kind: "DEATH" as const, years: 71, daysUntil: 0 };
    const death22 = { event: manual("e", "x", "1955-02-24"), kind: "DEATH" as const, years: 72, daysUntil: 0 };
    const death25 = { event: manual("e", "x", "1955-02-24"), kind: "DEATH" as const, years: 75, daysUntil: 0 };
    const event80 = { event: manual("e", "x", "1946-07-20"), kind: "EVENT" as const, years: 80, daysUntil: 0 };
    expect(anniversaryDetail(birth)).toBe("105 лет со дня рождения");
    expect(anniversaryDetail(death21)).toBe("день памяти — 71 год");
    expect(anniversaryDetail(death22)).toBe("день памяти — 72 года");
    expect(anniversaryDetail(death25)).toBe("день памяти — 75 лет");
    expect(anniversaryDetail(event80)).toBe("80 лет с события");
  });

  it("живому человеку — «исполняется N лет»", () => {
    const livingBirth = { event: manual("e", "x", "1975-09-05"), kind: "BIRTH" as const, years: 51, daysUntil: 0 };
    expect(anniversaryDetail(livingBirth, { living: true })).toBe("исполняется 51 год");
  });

  it("pluralYears: 1 год, 21 год, 22 года, 25 лет, 111 лет", () => {
    expect(pluralYears(1)).toBe("год");
    expect(pluralYears(21)).toBe("год");
    expect(pluralYears(22)).toBe("года");
    expect(pluralYears(25)).toBe("лет");
    expect(pluralYears(111)).toBe("лет");
  });

  it("dayKeyLabel: «12 июня», некорректный ключ — пустая строка", () => {
    expect(dayKeyLabel("06-12")).toBe("12 июня");
    expect(dayKeyLabel("13-01")).toBe("");
    expect(dayKeyLabel("не-ключ")).toBe("");
  });
});
