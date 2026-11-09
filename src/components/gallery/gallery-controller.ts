/**
 * Контроллер галереи: public.gallery с пагинацией, локальные фильтры,
 * семейные материалы после входа (метаданные — private.gallery, байты — private.media).
 */
import { apiGet, apiPost, encodeCursor } from "../../lib/api/client";
import type { PrivateGalleryItem, PublicGalleryItem } from "../../lib/api/types";
import { getToken } from "../../lib/auth/session";
import { store, STORE_EVENTS } from "../../lib/state/archive-store";
import { assetUrl } from "../../lib/urls";
import { isApiError } from "../../scripts/auth-flow";
import { setAsyncState, bindAsyncRoot } from "../../scripts/async-state";
import { openMediaInViewer } from "../../scripts/media-viewer";

const CATEGORY_LABELS: Record<string, string> = {
  archive: "Архивное фото",
  documents: "Документ",
  portraits: "Портрет"
};

const PAGE_SIZE = 24;
let currentFilter = "all";

function pluralMaterials(count: number): string {
  if (count === 1) return "1 материал";
  if (count >= 2 && count <= 4) return `${count} материала`;
  return `${count} материалов`;
}

function publicSource(item: PublicGalleryItem): string | null {
  if (item.path) return assetUrl(item.path);
  if (item.url) return item.url;
  return null;
}

function createPublicCard(item: PublicGalleryItem): HTMLElement {
  const article = document.createElement("article");
  article.className = "archive-card";
  article.dataset.category = item.category;
  const button = document.createElement("button");
  button.className = "archive-card-button";
  button.type = "button";
  // Доступное имя складывается из видимого заголовка и даты карточки.
  button.dataset.mediaId = item.mediaId;

  const wrap = document.createElement("div");
  wrap.className = "archive-image-wrap";
  const source = publicSource(item);
  if (source) {
    const image = document.createElement("img");
    image.src = source;
    image.alt = item.altText || item.title;
    image.width = 600;
    image.height = 450;
    image.loading = "lazy";
    image.onerror = () => {
      image.remove();
      const placeholder = document.createElement("span");
      placeholder.className = "material-placeholder";
      placeholder.textContent = "Изображение недоступно";
      wrap.append(placeholder);
    };
    wrap.append(image);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "material-placeholder";
    placeholder.textContent = "Материал недоступен";
    wrap.append(placeholder);
  }
  const type = document.createElement("span");
  type.className = "archive-type";
  type.textContent = CATEGORY_LABELS[item.category] ?? item.category;
  wrap.append(type);

  const copy = document.createElement("div");
  copy.className = "archive-card-copy";
  const title = document.createElement("h2");
  title.textContent = item.title;
  const date = document.createElement("p");
  date.textContent = item.caption ? `${item.dateDisplay} · ${item.caption}` : item.dateDisplay;
  copy.append(title, date);

  button.append(wrap, copy);
  button.addEventListener("click", () => {
    void openMediaInViewer({
      mediaId: item.mediaId,
      title: item.title,
      caption: item.caption || item.dateDisplay ? `${item.title} · ${item.dateDisplay}${item.caption ? ` — ${item.caption}` : ""}` : item.title,
      altText: item.altText,
      publicUrl: source
    });
  });
  article.append(button);
  return article;
}

function createFamilyCard(item: PrivateGalleryItem): HTMLElement {
  const article = document.createElement("article");
  article.className = "archive-card";
  article.dataset.category = item.category;
  article.dataset.family = "true";
  const button = document.createElement("button");
  button.className = "archive-card-button";
  button.type = "button";
  button.dataset.mediaId = item.mediaId;

  const wrap = document.createElement("div");
  wrap.className = "archive-image-wrap";
  const placeholder = document.createElement("span");
  placeholder.className = "material-placeholder";
  placeholder.textContent = "🔒 Семейный материал";
  wrap.append(placeholder);
  const familyType = document.createElement("span");
  familyType.className = "archive-family-type";
  familyType.textContent = CATEGORY_LABELS[item.category] ?? item.category;
  wrap.append(familyType);

  const copy = document.createElement("div");
  copy.className = "archive-card-copy";
  const title = document.createElement("h2");
  title.textContent = item.title;
  const date = document.createElement("p");
  date.textContent = item.dateDisplay;
  copy.append(title, date);

  button.append(wrap, copy);
  button.addEventListener("click", () => {
    void openMediaInViewer({
      mediaId: item.mediaId,
      title: item.title,
      caption: `${item.title} · ${item.dateDisplay}${item.caption ? ` — ${item.caption}` : ""}`,
      altText: item.altText,
      requiresSession: true
    });
  });
  article.append(button);
  return article;
}

function applyFilter(): void {
  const grid = document.getElementById("gallery-grid");
  if (!grid) return;
  let visibleCount = 0;
  grid.querySelectorAll<HTMLElement>(".archive-card").forEach((card) => {
    const isVisible = currentFilter === "all" || card.dataset.category === currentFilter;
    card.toggleAttribute("hidden", !isVisible);
    if (isVisible) visibleCount += 1;
  });
  const count = document.getElementById("gallery-count");
  if (count) count.textContent = pluralMaterials(visibleCount);
}

function renderGallery(): void {
  const grid = document.getElementById("gallery-grid");
  const more = document.getElementById("gallery-more");
  if (!grid) return;
  grid.replaceChildren();
  store.gallery.items.forEach((item) => grid.append(createPublicCard(item)));
  store.gallery.familyItems.forEach((item) => grid.append(createFamilyCard(item)));
  if (more) more.toggleAttribute("hidden", store.gallery.nextOffset === null);
  applyFilter();
}

async function loadGalleryPage(root: HTMLElement, append: boolean): Promise<void> {
  if (!append) setAsyncState(root, "loading");
  try {
    const params: Record<string, string> = { limit: String(PAGE_SIZE) };
    if (append && store.gallery.nextOffset !== null) {
      params.cursor = encodeCursor(store.gallery.nextOffset);
    }
    const page = await apiGet<{ items: PublicGalleryItem[]; nextCursorOffset: number | null }>("public.gallery", params);
    store.setGalleryPage(page.items, page.nextCursorOffset, append);
    const total = store.gallery.items.length + store.gallery.familyItems.length;
    setAsyncState(root, total === 0 ? "empty" : "content");
    if (total === 0) {
      setAsyncState(root, "empty", { emptyTitle: "Галерея пока пуста", emptyMessage: "Материалы появятся после наполнения семейной таблицы." });
    }
  } catch (error) {
    if (append) return; // догрузка молча терпит неудачу
    const message = isApiError(error) ? error.userMessage : "Архив временно недоступен.";
    setAsyncState(root, "error", { message });
  }
}

async function loadFamilyGallery(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const payload = await apiPost<{ items: PrivateGalleryItem[] }>("private.gallery", { token });
    store.setPrivateGallery(payload.items);
  } catch {
    // Публичная галерея остаётся рабочей.
  }
}

export function initGallery(): void {
  const maybeRoot = bindAsyncRoot("gallery", () => void loadGalleryPage(root, false));
  if (!maybeRoot) return;
  const root: HTMLElement = maybeRoot;

  document.querySelectorAll<HTMLButtonElement>("[data-gallery-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.galleryFilter ?? "all";
      document.querySelectorAll<HTMLButtonElement>("[data-gallery-filter]").forEach((filterButton) => {
        const isActive = filterButton === button;
        filterButton.classList.toggle("is-active", isActive);
        filterButton.setAttribute("aria-pressed", String(isActive));
      });
      applyFilter();
    });
  });

  document.getElementById("gallery-load-more")?.addEventListener("click", () => {
    void loadGalleryPage(root, true);
  });

  store.addEventListener(STORE_EVENTS.GALLERY, renderGallery);
  store.addEventListener(STORE_EVENTS.RESET_PRIVATE, renderGallery);
  store.addEventListener(STORE_EVENTS.FAMILY_CHANGE, () => {
    if (store.familyMode) void loadFamilyGallery();
  });

  void loadGalleryPage(root, false);
  if (getToken()) void loadFamilyGallery();
}

if (document.getElementById("gallery-grid")) {
  initGallery();
}
