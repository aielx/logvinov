/**
 * Контроллер лендинга: живые превью разделов из публичного API.
 * Счётчики в hero, схема поколений, события хронологии и материалы галереи —
 * только реальные опубликованные данные, демо-подстановок на главной нет.
 */
import { apiGet } from "../../lib/api/client";
import type { PublicGalleryItem, PublicTimelineEvent, PublicTree, PublicTreePerson } from "../../lib/api/types";
import { assetUrl } from "../../lib/urls";

const GENERATIONS_SHOWN = 3;
const PREVIEW_ITEMS = 3;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** Русская плюрализация: plural(2, "поколение", "поколения", "поколений"). */
function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const PATRONYMIC_ENDINGS = ["инична", "инишна", "ична", "ишна", "ович", "евич", "овна", "евна", "ьич", "ич"];

function isPatronymic(token: string): boolean {
  const lower = token.toLowerCase();
  return PATRONYMIC_ENDINGS.some((ending) => lower.length > ending.length && lower.endsWith(ending));
}

/** Короткое имя для плитки превью: «Логвинова (Сухова) Мария Викторовна» → «Мария Викторовна». */
function shortName(displayName: string): string {
  const tokens = displayName.split(/\s+/).filter((token) => token && !token.startsWith("("));
  const patronymicIndex = tokens.findIndex(isPatronymic);
  if (patronymicIndex > 0) return `${tokens[patronymicIndex - 1]} ${tokens[patronymicIndex]}`;
  return tokens.length >= 3 ? tokens.slice(1).join(" ") : displayName;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function previewHint(root: HTMLElement | null, message: string): void {
  if (!root) return;
  const hint = el("p", "preview-hint");
  hint.textContent = message;
  root.replaceChildren(hint);
}

// --- Hero: счётчики архива ---------------------------------------------------

function renderHeroCounts(tree: PublicTree, eventCount: number): void {
  const people = tree.people.length;
  const generations = tree.people.reduce((max, person) => Math.max(max, person.generation), 1);
  const eyebrow = document.getElementById("hero-eyebrow");
  if (eyebrow) eyebrow.textContent = `Семейный архив · ${generations} ${plural(generations, "поколение", "поколения", "поколений")}`;
  const meta = document.getElementById("hero-meta");
  if (!meta) return;
  const values = [
    `${people} ${plural(people, "человек", "человека", "человек")}`,
    `${generations} ${plural(generations, "поколение", "поколения", "поколений")}`,
    `${eventCount} ${plural(eventCount, "событие", "события", "событий")}`
  ];
  meta.replaceChildren(
    ...values.map((value) => {
      const span = el("span");
      span.textContent = value;
      return span;
    })
  );
  meta.removeAttribute("hidden");
}

// --- Превью древа: первые поколения ------------------------------------------

function renderTreePreview(tree: PublicTree): void {
  const root = document.getElementById("tree-preview");
  if (!root) return;
  const byId = new Map(tree.people.map((person) => [person.personId, person]));
  const byGeneration = new Map<number, PublicTreePerson[]>();
  tree.people.forEach((person) => {
    const bucket = byGeneration.get(person.generation) ?? [];
    bucket.push(person);
    byGeneration.set(person.generation, bucket);
  });
  const generations = Array.from(byGeneration.keys()).sort((a, b) => a - b).slice(0, GENERATIONS_SHOWN);
  if (generations.length === 0) {
    previewHint(root, "Древо появится здесь, когда будут опубликованы первые поколения рода.");
    return;
  }

  const row = (person: PublicTreePerson): HTMLElement => {
    const tile = el("span", "preview-person");
    const name = el("strong");
    name.textContent = shortName(person.displayName);
    const years = el("small");
    years.textContent = person.years;
    tile.append(name, years);
    return tile;
  };

  const parts: HTMLElement[] = [];
  generations.forEach((generation, index) => {
    if (index > 0) parts.push(el("span", "preview-connector"));
    const people = (byGeneration.get(generation) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    const block = el("div", "preview-generation");
    const label = el("span", "preview-label");
    label.textContent = `${ROMAN[generation - 1] ?? generation} поколение`;
    block.append(label);

    const anchor = people[0];
    const spouse = anchor
      ? anchor.spouseIds.map((id) => byId.get(id)).find((candidate) => candidate && candidate.generation === generation)
      : undefined;
    const couple = el("div", "preview-couple");
    if (spouse) {
      couple.append(row(anchor), el("span", "preview-marriage"), row(spouse));
    } else {
      couple.classList.add("preview-children");
      people.slice(0, 2).forEach((person) => couple.append(row(person)));
    }
    block.append(couple);

    const rest = people.length - (spouse ? 2 : Math.min(people.length, 2));
    if (rest > 0) {
      const more = el("span", "preview-more");
      more.textContent = `+${rest} ${plural(rest, "человек", "человека", "человек")}`;
      block.append(more);
    }
    parts.push(block);
  });

  const restGenerations = Array.from(byGeneration.keys()).length - generations.length;
  if (restGenerations > 0) {
    const more = el("span", "preview-more preview-more-generations");
    more.textContent = `… ещё ${restGenerations} ${plural(restGenerations, "поколение", "поколения", "поколений")}`;
    parts.push(more);
  }
  root.replaceChildren(...parts);
}

// --- Превью хронологии: первое, среднее и последнее события -------------------

function renderTimelinePreview(events: PublicTimelineEvent[]): void {
  const root = document.getElementById("timeline-preview");
  if (!root) return;
  if (events.length === 0) {
    previewHint(root, "События появятся здесь по мере наполнения архива.");
    return;
  }
  const sorted = [...events].sort((a, b) => a.sortKey - b.sortKey);
  const picks = sorted.length <= PREVIEW_ITEMS ? sorted : [sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted[sorted.length - 1]];
  const articles = picks.map((event) => {
    const article = el("article");
    const date = event.date.trim();
    // Год или диапазон «1941–1945» показываем как есть; прочие даты — первым годом.
    const year = /^\d{4}(–\d{4})?$/.test(date) ? date : (date.match(/\d{4}/) ?? [date])[0];
    const time = el("time");
    time.dateTime = /^\d{4}/.test(year) ? year.slice(0, 4) : year;
    time.textContent = year;
    const body = el("div");
    const title = el("h3");
    title.textContent = event.title;
    body.append(title);
    if (event.description) {
      const text = el("p");
      text.textContent = event.description;
      body.append(text);
    }
    article.append(time, body);
    return article;
  });
  root.replaceChildren(...articles);
}

// --- Превью галереи: первые опубликованные материалы --------------------------

function renderGalleryPreview(items: PublicGalleryItem[]): void {
  const root = document.getElementById("gallery-preview");
  if (!root) return;
  const figures = items
    .map((item) => {
      const source = item.path ? assetUrl(item.path) : item.url;
      if (!source) return null;
      const figure = el("figure");
      const image = document.createElement("img");
      image.src = source;
      image.alt = item.altText || item.title;
      image.width = 600;
      image.height = 420;
      image.loading = "lazy";
      const caption = el("figcaption");
      caption.textContent = item.dateDisplay ? `${item.title} · ${item.dateDisplay}` : item.title;
      figure.append(image, caption);
      return figure;
    })
    .filter((figure): figure is HTMLElement => figure !== null);
  if (figures.length === 0) {
    previewHint(root, "Материалы появятся здесь по мере наполнения архива.");
    return;
  }
  root.replaceChildren(...figures);
}

// --- Инициализация -----------------------------------------------------------

async function loadSection<T>(rootId: string, request: () => Promise<T>, render: (data: T) => void): Promise<void> {
  const root = document.getElementById(rootId);
  try {
    render(await request());
  } catch {
    previewHint(root, "Архив временно недоступен — откройте раздел целиком чуть позже.");
  }
}

export function initLanding(): void {
  if (!document.getElementById("tree-preview")) return;

  void loadSection(
    "tree-preview",
    () => apiGet<PublicTree>("public.tree"),
    (tree) => {
      renderTreePreview(tree);
      apiGet<{ events: PublicTimelineEvent[] }>("public.timeline")
        .then((payload) => {
          renderHeroCounts(tree, payload.events.length);
          renderTimelinePreview(payload.events);
        })
        .catch(() => {
          renderHeroCounts(tree, 0);
          previewHint(document.getElementById("timeline-preview"), "Архив временно недоступен — откройте раздел целиком чуть позже.");
        });
    }
  );

  void loadSection(
    "gallery-preview",
    () => apiGet<{ items: PublicGalleryItem[] }>("public.gallery", { limit: String(PREVIEW_ITEMS) }),
    (payload) => renderGalleryPreview(payload.items)
  );
}

initLanding();
