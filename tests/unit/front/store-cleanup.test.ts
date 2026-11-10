import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { store, STORE_EVENTS } from "../../../src/lib/state/archive-store";
import { createPrivateController, registerObjectUrl, releasePrivateResources, revokeObjectUrl } from "../../../src/lib/privacy/cleanup";
import type { PublicTimelineEvent } from "../../../src/lib/api/types";

const revokeSpy = vi.fn();
const abortSpy = vi.fn();

beforeEach(() => {
  revokeSpy.mockClear();
  abortSpy.mockClear();
  // Node не имеет createObjectURL — подменяем.
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:mock";
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = revokeSpy;
});

afterEach(() => {
  releasePrivateResources();
});

describe("ArchiveStore", () => {
  it("события сортируются и сливаются без дублей", () => {
    const events: PublicTimelineEvent[] = [
      { eventId: "e2", eventType: "FAMILY", title: "B", date: "1900", sortKey: 19000000, description: "", primaryPersonId: null },
      { eventId: "e1", eventType: "FAMILY", title: "A", date: "1890", sortKey: 18900000, description: "", primaryPersonId: null }
    ];
    store.setTimeline(events);
    store.addFamilyEvents([
      { eventId: "e1", eventType: "FAMILY", title: "A", date: "1890", sortKey: 18900000, description: "новое", primaryPersonId: null },
      { eventId: "e3", eventType: "FAMILY", title: "C", date: "1910", sortKey: 19100000, description: "", primaryPersonId: null }
    ]);
    expect(store.timeline.map((event) => event.eventId)).toEqual(["e1", "e2", "e3"]);
  });

  it("сохраняет семейные события при более поздней загрузке публичной ленты", () => {
    const familyEvent: PublicTimelineEvent & { familyOnly: true } = {
      eventId: "family-race",
      eventType: "FAMILY",
      kind: "BIRTH",
      title: "Семейное событие",
      date: "1975-09-05",
      sortKey: 19750905,
      description: "",
      primaryPersonId: null,
      dayKey: "09-05",
      familyOnly: true
    };
    store.setTimeline([]);
    store.addFamilyEvents([familyEvent]);
    store.setTimeline([
      { eventId: "public-race", eventType: "FAMILY", title: "Публичное событие", date: "1900", sortKey: 19000000, description: "", primaryPersonId: null }
    ]);

    expect(store.timeline.map((event) => event.eventId)).toEqual(["public-race", "family-race"]);
    expect(store.timeline.find((event) => event.eventId === "family-race")).toMatchObject({ familyOnly: true });

    store.resetPrivate();
    expect(store.timeline.map((event) => event.eventId)).toEqual(["public-race"]);
  });

  it("resetPrivate полностью очищает приватное состояние и отзывает ресурсы", () => {
    registerObjectUrl("blob:1");
    registerObjectUrl("blob:2");
    revokeObjectUrl("blob:2");
    const controller = createPrivateController();
    controller.signal.addEventListener("abort", abortSpy);
    store.familyMode = true;
    store.pendingPersonId = "p_0008";
    store.mergeFamilyDescription("e_0012", "secret");

    store.resetPrivate();

    expect(store.familyMode).toBe(false);
    expect(store.pendingPersonId).toBeNull();
    expect(store.familyEventDescriptions.size).toBe(0);
    expect(store.gallery.familyItems).toEqual([]);
    expect(revokeSpy).toHaveBeenCalledTimes(2); // blob:2 (ранний отзыв) + blob:1 (полный)
    expect(abortSpy).toHaveBeenCalled();
  });

  it("рассылает события подписчикам", () => {
    const listener = vi.fn();
    store.addEventListener(STORE_EVENTS.FAMILY_CHANGE, listener);
    store.enterFamily();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.familyMode).toBe(true);
    store.resetPrivate();
  });
});
