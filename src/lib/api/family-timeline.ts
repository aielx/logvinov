/**
 * Загрузка семейной хронологии после входа: private.timeline объединяется
 * с публичной лентой в store. Общий код страницы «Хронология» и главной
 * (карточка «В этот день» показывает семейные даты после входа).
 */
import { apiPost } from "./client";
import type { PrivateTimelineEvent, PublicTimelineEvent } from "./types";
import { getToken } from "../auth/session";
import { store } from "../state/archive-store";
import { isVitalKind } from "../timeline-vital";

export async function loadFamilyTimeline(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const payload = await apiPost<{ events: PrivateTimelineEvent[] }>("private.timeline", { token });
    const fullEvents: Array<PublicTimelineEvent & { familyOnly: true }> = [];
    payload.events.forEach((event) => {
      if ("familyDescription" in event && event.familyDescription !== undefined) {
        store.mergeFamilyDescription(event.eventId, event.familyDescription);
      } else {
        const full = event as PublicTimelineEvent;
        fullEvents.push({
          eventId: full.eventId,
          eventType: full.eventType,
          ...(isVitalKind(full.kind) ? { kind: full.kind } : {}),
          title: full.title,
          date: full.date,
          sortKey: full.sortKey,
          description: full.description,
          primaryPersonId: full.primaryPersonId,
          ...(full.dayKey ? { dayKey: full.dayKey } : {}),
          familyOnly: true
        });
      }
    });
    if (fullEvents.length) store.addFamilyEvents(fullEvents);
  } catch {
    // Семейные события недоступны — публичная лента остаётся рабочей.
  }
}
