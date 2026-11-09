import { describe, expect, it } from "vitest";
import { formatSoftDate, formatYears, parseIsoDate } from "../../../src/lib/dates";

describe("parseIsoDate", () => {
  it("YYYY, YYYY-MM, YYYY-MM-DD без сдвига часового пояса", () => {
    expect(parseIsoDate("1890")).toEqual({ year: 1890, month: null, day: null });
    expect(parseIsoDate("1937-03")).toEqual({ year: 1937, month: 3, day: null });
    expect(parseIsoDate("1937-03-14")).toEqual({ year: 1937, month: 3, day: 14 });
  });

  it("мусор отклоняется", () => {
    expect(parseIsoDate("14.03.1937")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });
});

describe("formatSoftDate", () => {
  it("учитывает точность", () => {
    expect(formatSoftDate("1937")).toBe("1937 г.");
    expect(formatSoftDate("1937-03")).toBe("Март 1937 г.");
    expect(formatSoftDate("1937-03-14")).toBe("14 марта 1937 г.");
    expect(formatSoftDate("")).toBe("");
  });
});

describe("formatYears", () => {
  it("публичные годы", () => {
    expect(formatYears(1890, 1955, false)).toBe("1890–1955");
    expect(formatYears(1975, null, true)).toBe("1975–н. в.");
    expect(formatYears(null, null, true)).toBe("годы не уточнены");
    expect(formatYears(1900, null, false)).toBe("1900");
  });
});
