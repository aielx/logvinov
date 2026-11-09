/**
 * Контроллер хронологии: public.timeline, семейные события и описания после входа.
 * Рендер через createElement/textContent — без innerHTML для данных.
 */
import { apiGet, apiPost } from "../../lib/api/client";
import type { PrivateTimelineEvent, PublicTimelineEvent } from "../../lib/api/types";
import { getToken } from "../../lib/auth/session";
import { store, STORE_EVENTS } from "../../lib/state/archive-store";
import { isApiError } from "../../scripts/auth-flow";
import { setAsyncState, bindAsyncRoot } from "../../scripts/async-state";

/** Событие в store: публичное или семейное (появляется только после входа). */
type StoreEvent = PublicTimelineEvent & { familyOnly?: boolean };

function markerLetter(event: StoreEvent): string {
  return event.title.charAt(0).toUpperCase();
}

function renderTimeline(): void {
  const root = document.getElementById("timeline-list");
  if (!root) return;
  root.replaceChildren();
  const events = ([...store.timeline] as StoreEvent[]).sort((a, b) => a.sortKey - b.sortKey);
  events.forEach((event) => {
    const familyDescription = store.familyEventDescriptions.get(event.eventId);
    const item = document.createElement("article");
    item.className = `timeline-item${event.eventType === "HISTORY" ? " is-history" : ""}`;
    const marker = document.createElement("span");
    marker.className = "timeline-marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = markerLetter(event);
    const card = document.createElement("div");
    card.className = "timeline-card";
    const date = document.createElement("time");
    date.className = "timeline-date";
    date.textContent = event.date || "дата уточняется";
    const title = document.createElement("h2");
    title.textContent = event.title;
    const description = document.createElement("p");
    description.textContent = familyDescription ?? event.description;
    card.append(date, title, description);
    if (familyDescription || event.familyOnly) {
      const badge = document.createElement("span");
      badge.className = "family-badge";
      badge.textContent = "Семейное событие";
      card.append(badge);
    }
    item.append(marker, card);
    root.append(item);
  });
}

async function loadFamilyEvents(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const payload = await apiPost<{ events: PrivateTimelineEvent[] }>("private.timeline", { token });
    const fullEvents: StoreEvent[] = [];
    payload.events.forEach((event) => {
      if ("familyDescription" in event && event.familyDescription !== undefined) {
        store.mergeFamilyDescription(event.eventId, event.familyDescription);
      } else {
        const full = event as PublicTimelineEvent;
        fullEvents.push({
          eventId: full.eventId,
          eventType: full.eventType,
          title: full.title,
          date: full.date,
          sortKey: full.sortKey,
          description: full.description,
          primaryPersonId: full.primaryPersonId,
          familyOnly: true
        });
      }
    });
    if (fullEvents.length) store.addFamilyEvents(fullEvents);
  } catch {
    // Семейные события недоступны — публичная хронология остаётся рабочей.
  }
}

async function loadTimeline(root: HTMLElement): Promise<void> {
  setAsyncState(root, "loading");
  try {
    const payload = await apiGet<{ events: PublicTimelineEvent[] }>("public.timeline");
    store.setTimeline(payload.events);
    setAsyncState(root, payload.events.length === 0 ? "empty" : "content");
    if (payload.events.length === 0) {
      setAsyncState(root, "empty", { emptyTitle: "События пока не добавлены", emptyMessage: "Хронология появится после наполнения семейной таблицы." });
    }
    renderTimeline();
    await loadFamilyEvents();
  } catch (error) {
    const message = isApiError(error) ? error.userMessage : "Архив временно недоступен.";
    setAsyncState(root, "error", { message });
  }
}

export function initTimeline(): void {
  const maybeRoot = bindAsyncRoot("timeline", () => void loadTimeline(root));
  if (!maybeRoot) return;
  const root: HTMLElement = maybeRoot;
  store.addEventListener(STORE_EVENTS.TIMELINE, renderTimeline);
  store.addEventListener(STORE_EVENTS.RESET_PRIVATE, renderTimeline);
  store.addEventListener(STORE_EVENTS.FAMILY_CHANGE, () => {
    if (store.familyMode) {
      void loadFamilyEvents();
    }
  });
  void loadTimeline(root);
}

if (document.getElementById("timeline-list")) {
  initTimeline();
}
