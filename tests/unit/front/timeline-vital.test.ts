import { describe, expect, it } from "vitest";
import {
  buildTimelineEntries,
  vitalDateLabel,
  vitalLabel,
  vitalMarker,
  type TimelineEvent
} from "../../../src/lib/timeline-vital";

function manual(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    eventId: "e_0001",
    eventType: "FAMILY",
    title: "Брак Ивана и Анны",
    date: "1946",
    sortKey: 19460000,
    description: "описание",
    primaryPersonId: null,
    ...overrides
  };
}

function vital(overrides: Partial<TimelineEvent> & { kind: "BIRTH" | "DEATH" }): TimelineEvent {
  return manual({ eventId: `auto-${overrides.kind.toLowerCase()}-p_0001`, description: "", ...overrides });
}

describe("buildTimelineEntries", () => {
  it("обычные события проходят как есть, витальные собираются в группы по году", () => {
    const entries = buildTimelineEntries([
      vital({ kind: "BIRTH", eventId: "auto-birth-p_0003", title: "Пётр", primaryPersonId: "p_0003", sortKey: 19220000, date: "1922" }),
      vital({ kind: "BIRTH", eventId: "auto-birth-p_0004", title: "Анна", primaryPersonId: "p_0004", sortKey: 19220000, date: "1922" }),
      manual({ eventId: "e_0002", sortKey: 18900000, date: "1890" })
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe("event");
    expect(entries[1].type).toBe("vital");
    expect(entries[1].group?.members.map((member) => member.name)).toEqual(["Пётр", "Анна"]);
  });

  it("рождения и смерти одного года — разные группы, порядок по дате", () => {
    const entries = buildTimelineEntries([
      vital({ kind: "DEATH", eventId: "auto-death-p_0001", title: "Иван", primaryPersonId: "p_0001", sortKey: 19550601, date: "1955-06-01" }),
      vital({ kind: "BIRTH", eventId: "auto-birth-p_0001", title: "Иван", primaryPersonId: "p_0001", sortKey: 19550101, date: "1955-01-01" })
    ]);
    expect(entries.map((entry) => entry.group?.kind)).toEqual(["BIRTH", "DEATH"]);
  });

  it("при равной дате ручное событие идёт раньше автогруппы", () => {
    const entries = buildTimelineEntries([
      vital({ kind: "BIRTH", eventId: "auto-birth-p_0002", title: "Мария", primaryPersonId: "p_0002", sortKey: 18950000, date: "1895" }),
      manual({ eventId: "e_0009", title: "Революция", eventType: "HISTORY", sortKey: 18950000, date: "1895" })
    ]);
    expect(entries[0].event?.eventId).toBe("e_0009");
    expect(entries[1].group?.members[0]?.name).toBe("Мария");
  });

  it("familyOnly подтягивается на группу от любого участника", () => {
    const entries = buildTimelineEntries([
      vital({ kind: "BIRTH", eventId: "auto-birth-p_0008", title: "Алексей", primaryPersonId: "p_0008", sortKey: 19750000, date: "1975", familyOnly: true })
    ]);
    expect(entries[0].group?.familyOnly).toBe(true);
    expect(entries[0].group?.members[0]?.familyOnly).toBe(true);
  });
});

describe("маркеры и подписи", () => {
  it("генеалогические символы и понятные подписи событий", () => {
    expect(vitalMarker("BIRTH")).toBe("*");
    expect(vitalMarker("DEATH")).toBe("†");
    expect(vitalLabel("BIRTH")).toBe("День рождения");
    expect(vitalLabel("DEATH")).toBe("День памяти");
  });
});

describe("vitalDateLabel", () => {
  it("год без изменений, точные даты по-русски", () => {
    expect(vitalDateLabel("1890")).toBe("1890");
    expect(vitalDateLabel("1890-05")).toBe("Май 1890 г.");
    expect(vitalDateLabel("1890-05-17")).toBe("17 мая 1890 г.");
    expect(vitalDateLabel("дата уточняется")).toBe("дата уточняется");
  });
});
