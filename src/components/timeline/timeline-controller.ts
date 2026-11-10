/**
 * Контроллер хронологии: public.timeline, семейные события и описания после входа.
 * Рождения и смерти (kind из API) выводятся компактными строками с группировкой
 * по году; обычные события — карточками. Рендер через createElement/textContent.
 */
import { apiGet, apiPost } from "../../lib/api/client";
import type { PrivateTimelineEvent, PublicTimelineEvent } from "../../lib/api/types";
import { getToken } from "../../lib/auth/session";
import { store, STORE_EVENTS } from "../../lib/state/archive-store";
import { pageUrl } from "../../lib/urls";
import {
  buildTimelineEntries,
  isVitalKind,
  vitalDateLabel,
  vitalLabel,
  vitalMarker,
  type TimelineEntry,
  type TimelineEvent,
  type VitalGroup
} from "../../lib/timeline-vital";
import { isApiError } from "../../scripts/auth-flow";
import { setAsyncState, bindAsyncRoot } from "../../scripts/async-state";

/** Постоянные фильтры ленты: семейные даты и исторический контекст. */
const FILTER_STORAGE_KEY = "logvinov:timeline-filters";

type FilterState = { family: boolean; history: boolean };

function defaultFilters(): FilterState {
  return { family: true, history: true };
}

function loadFilters(): FilterState {
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return defaultFilters();
    const parsed = JSON.parse(raw) as Partial<FilterState>;
    return {
      family: typeof parsed.family === "boolean" ? parsed.family : true,
      history: typeof parsed.history === "boolean" ? parsed.history : true
    };
  } catch {
    return defaultFilters();
  }
}

function saveFilters(filters: FilterState): void {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // localStorage недоступен (приватный режим) — фильтры живут до перезагрузки.
  }
}

let filters = loadFilters();

function entryVisible(entry: TimelineEntry): boolean {
  if (entry.type === "vital") return filters.family;
  return entry.event?.eventType === "HISTORY" ? filters.history : filters.family;
}

function syncChips(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-timeline-filter]").forEach((chip) => {
    const kind = chip.dataset.timelineFilter;
    if (kind === "family" || kind === "history") {
      chip.setAttribute("aria-pressed", String(filters[kind]));
    }
  });
}

function initChips(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-timeline-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const kind = chip.dataset.timelineFilter;
      if (kind !== "family" && kind !== "history") return;
      filters = { ...filters, [kind]: !filters[kind] };
      saveFilters(filters);
      syncChips();
      renderTimeline();
    });
  });
  syncChips();
}

function personLink(personId: string, name: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = `${pageUrl("tree")}?person=${encodeURIComponent(personId)}`;
  link.textContent = name;
  return link;
}

function renderVitalGroup(group: VitalGroup): HTMLElement {
  const item = document.createElement("article");
  item.className = `timeline-item is-vital${group.familyOnly ? " is-family-only" : ""}`;
  const names = group.members.map((member) => member.name).join(", ");
  item.setAttribute("aria-label", `${vitalLabel(group.kind)}: ${names}, ${vitalDateLabel(group.date)}`);
  const marker = document.createElement("span");
  marker.className = "timeline-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = vitalMarker(group.kind);
  const card = document.createElement("div");
  card.className = "timeline-card vital-card";
  const date = document.createElement("time");
  date.className = "timeline-date";
  date.dateTime = group.date;
  date.textContent = vitalDateLabel(group.date);
  const line = document.createElement("p");
  line.className = "vital-names";
  group.members.forEach((member, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "vital-sep";
      separator.setAttribute("aria-hidden", "true");
      separator.textContent = "·";
      line.append(separator);
    }
    line.append(personLink(member.personId, member.name));
  });
  card.append(date, line);
  if (group.familyOnly) {
    const badge = document.createElement("span");
    badge.className = "family-badge family-badge-mini";
    badge.textContent = "Семейное";
    card.append(badge);
  }
  item.append(marker, card);
  return item;
}

function renderEventCard(event: TimelineEvent): HTMLElement {
  const familyDescription = store.familyEventDescriptions.get(event.eventId);
  const item = document.createElement("article");
  item.className = `timeline-item${event.eventType === "HISTORY" ? " is-history" : ""}`;
  const marker = document.createElement("span");
  marker.className = "timeline-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = event.title.charAt(0).toUpperCase();
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
  return item;
}

function renderTimeline(): void {
  const root = document.getElementById("timeline-list");
  if (!root) return;
  root.replaceChildren();
  const entries = buildTimelineEntries([...store.timeline] as TimelineEvent[]).filter(entryVisible);
  entries.forEach((entry) => {
    if (entry.type === "vital" && entry.group) {
      root.append(renderVitalGroup(entry.group));
    } else if (entry.event) {
      root.append(renderEventCard(entry.event));
    }
  });
  if (entries.length === 0 && store.timeline.length > 0) {
    const hint = document.createElement("p");
    hint.className = "timeline-filter-empty";
    hint.textContent = "Выберите хотя бы один тип событий.";
    root.append(hint);
  }
}

async function loadFamilyEvents(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const payload = await apiPost<{ events: PrivateTimelineEvent[] }>("private.timeline", { token });
    const fullEvents: TimelineEvent[] = [];
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
      setAsyncState(root, "empty", { emptyTitle: "События пока не добавлены", emptyMessage: "Хронология появится по мере наполнения архива." });
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
  initChips();
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
