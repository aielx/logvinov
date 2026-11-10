/**
 * Централизованный просмотрщик материалов: публичные ссылки/ассеты и приватные
 * медиа по mediaId (DRIVE-байты → Blob → временный Object URL с отзывом).
 */
import { apiPost } from "../lib/api/client";
import type { PrivateMediaPayload } from "../lib/api/types";
import { getToken } from "../lib/auth/session";
import { assetUrl } from "../lib/urls";
import { createPrivateController, registerObjectUrl, revokeObjectUrl } from "../lib/privacy/cleanup";
import { handleSessionInvalid, isApiError } from "./auth-flow";

export interface MediaDescriptor {
  mediaId: string;
  title: string;
  caption: string;
  altText: string;
  /** Публичный источник уже разрешён ссылкой (path/URL). */
  publicUrl?: string | null;
  /** Приватный материал: байты/ссылка получаются через private.media. */
  requiresSession?: boolean;
}

let currentObjectUrl: string | null = null;
let currentController: AbortController | null = null;

// --- Масштаб изображения: кнопки/колесо/двойной клик, перетаскивание, пинч ---
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;

let zoom = 1;
let panX = 0;
let panY = 0;

function viewerElements() {
  return {
    dialog: document.getElementById("media-viewer") as HTMLDialogElement | null,
    image: document.getElementById("media-viewer-image") as HTMLImageElement | null,
    caption: document.getElementById("media-viewer-caption") as HTMLParagraphElement | null,
    loading: document.getElementById("media-viewer-loading") as HTMLDivElement | null,
    error: document.getElementById("media-viewer-error") as HTMLDivElement | null,
    documentLink: document.getElementById("media-viewer-document") as HTMLAnchorElement | null,
    controls: document.getElementById("media-viewer-controls") as HTMLDivElement | null,
    zoomLevel: document.getElementById("media-zoom-level") as HTMLSpanElement | null
  };
}

function applyZoom(animate: boolean): void {
  const { image, zoomLevel } = viewerElements();
  if (image) {
    image.classList.toggle("is-zoomed", zoom > 1);
    image.classList.toggle("no-transition", !animate);
    image.style.transform = zoom > 1 ? `translate(${panX}px, ${panY}px) scale(${zoom})` : "";
  }
  if (zoomLevel) zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
}

/** Пан не уводит картину за край экрана: запас — половина «вылезания» + 48px. */
function clampPan(): void {
  const { image } = viewerElements();
  if (zoom <= 1 || !image) {
    panX = 0;
    panY = 0;
    return;
  }
  const rect = image.getBoundingClientRect();
  const maxX = Math.max(0, (rect.width - rect.width / zoom) / 2 + 48);
  const maxY = Math.max(0, (rect.height - rect.height / zoom) / 2 + 48);
  panX = Math.min(maxX, Math.max(-maxX, panX));
  panY = Math.min(maxY, Math.max(-maxY, panY));
}

/** Масштаб к точке экрана: точка под курсором остаётся на месте. */
function zoomAt(clientX: number, clientY: number, factor: number, animate = true): void {
  const { image } = viewerElements();
  if (!image || image.hidden) return;
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
  if (next !== zoom) {
    const rect = image.getBoundingClientRect();
    const ratio = next / zoom;
    panX += (clientX - (rect.left + rect.width / 2)) * (1 - ratio);
    panY += (clientY - (rect.top + rect.height / 2)) * (1 - ratio);
    zoom = next;
  }
  if (zoom === ZOOM_MIN) {
    panX = 0;
    panY = 0;
  }
  clampPan();
  applyZoom(animate);
}

function resetZoom(): void {
  zoom = ZOOM_MIN;
  panX = 0;
  panY = 0;
  applyZoom(false);
}

function resetViewer(): void {
  const { image, caption, loading, error, documentLink, controls } = viewerElements();
  if (currentObjectUrl) {
    revokeObjectUrl(currentObjectUrl);
    currentObjectUrl = null;
  }
  currentController?.abort();
  currentController = null;
  resetZoom();
  if (controls) controls.hidden = true;
  if (image) {
    image.removeAttribute("src");
    image.hidden = true;
  }
  if (loading) loading.hidden = true;
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  if (documentLink) {
    documentLink.hidden = true;
    documentLink.removeAttribute("href");
  }
  if (caption) caption.textContent = "";
}

function showImage(src: string, alt: string, objectUrl?: string): void {
  const { image, loading, controls } = viewerElements();
  if (objectUrl) {
    currentObjectUrl = objectUrl;
    registerObjectUrl(objectUrl);
  }
  if (!image) return;
  resetZoom();
  if (controls) controls.hidden = false;
  image.hidden = false;
  image.src = src;
  image.alt = alt;
  image.onerror = () => {
    resetViewer();
    showError("Не удалось загрузить изображение. Возможно, источник недоступен.");
  };
  if (loading) loading.hidden = true;
}

function showDocument(url: string, label: string, objectUrl?: string): void {
  const { documentLink, loading, controls } = viewerElements();
  if (controls) controls.hidden = true;
  if (objectUrl) {
    currentObjectUrl = objectUrl;
    registerObjectUrl(objectUrl);
  }
  if (!documentLink) return;
  documentLink.hidden = false;
  documentLink.href = url;
  documentLink.textContent = `Открыть документ: ${label}`;
  documentLink.target = "_blank";
  documentLink.rel = "noopener noreferrer";
  if (loading) loading.hidden = true;
}

function showError(message: string): void {
  const { error, loading } = viewerElements();
  if (loading) loading.hidden = true;
  if (error) {
    error.textContent = message;
    error.removeAttribute("hidden");
  }
}

function bytesToObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export function initMediaViewer(): void {
  const { dialog } = viewerElements();
  if (!dialog || dialog.dataset.zoomBound === "1") return;
  dialog.dataset.zoomBound = "1";
  dialog.addEventListener("close", () => {
    resetViewer();
  });
  bindZoomControls(dialog);
}

function imageCenter(): { x: number; y: number } {
  const { image } = viewerElements();
  const rect = image?.getBoundingClientRect();
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
}

/** Один общий down/move/up: перетаскивание при зуме и пинч двумя пальцами. */
function bindZoomControls(dialog: HTMLDialogElement): void {
  const zoomIn = document.getElementById("media-zoom-in");
  const zoomOut = document.getElementById("media-zoom-out");
  const zoomReset = document.getElementById("media-zoom-reset");

  zoomIn?.addEventListener("click", () => {
    const center = imageCenter();
    zoomAt(center.x, center.y, ZOOM_STEP);
  });
  zoomOut?.addEventListener("click", () => {
    const center = imageCenter();
    zoomAt(center.x, center.y, 1 / ZOOM_STEP);
  });
  zoomReset?.addEventListener("click", resetZoom);

  dialog.addEventListener(
    "wheel",
    (event) => {
      const { image } = viewerElements();
      if (!image || image.hidden) return;
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015), false);
    },
    { passive: false }
  );

  dialog.addEventListener("dblclick", (event) => {
    const { image } = viewerElements();
    if (!image || image.hidden || event.target !== image) return;
    if (zoom > ZOOM_MIN) resetZoom();
    else zoomAt(event.clientX, event.clientY, 2.5);
  });

  dialog.addEventListener("keydown", (event) => {
    const { image } = viewerElements();
    if (!image || image.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
    const center = imageCenter();
    const pan = (dx: number, dy: number) => {
      if (zoom <= ZOOM_MIN) return;
      event.preventDefault();
      panX += dx;
      panY += dy;
      clampPan();
      applyZoom(false);
    };
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAt(center.x, center.y, ZOOM_STEP);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomAt(center.x, center.y, 1 / ZOOM_STEP);
    } else if (event.key === "0") {
      resetZoom();
    } else if (event.key === "ArrowLeft") {
      pan(80, 0);
    } else if (event.key === "ArrowRight") {
      pan(-80, 0);
    } else if (event.key === "ArrowUp") {
      pan(0, 80);
    } else if (event.key === "ArrowDown") {
      pan(0, -80);
    }
  });

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchBase: { distance: number } | null = null;
  let dragging = false;
  let dragStart: { x: number; y: number; panX: number; panY: number } | null = null;

  dialog.addEventListener("pointerdown", (event) => {
    const { image } = viewerElements();
    if (!image || image.hidden || event.button > 0) return;
    if (event.target !== image) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    image.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      if (zoom > ZOOM_MIN) {
        dragging = true;
        dragStart = { x: event.clientX, y: event.clientY, panX, panY };
        image.classList.add("is-dragging");
      }
    } else if (pointers.size === 2) {
      dragging = false;
      dragStart = null;
      const [a, b] = Array.from(pointers.values());
      pinchBase = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  });

  dialog.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinchBase && pinchBase.distance > 0) {
      const [a, b] = Array.from(pointers.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, distance / pinchBase.distance, false);
      return;
    }
    if (dragging && dragStart) {
      panX = dragStart.panX + (event.clientX - dragStart.x);
      panY = dragStart.panY + (event.clientY - dragStart.y);
      clampPan();
      applyZoom(false);
    }
  });

  const endPointer = (event: PointerEvent): void => {
    const { image } = viewerElements();
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchBase = null;
    if (pointers.size === 0) {
      dragging = false;
      dragStart = null;
      image?.classList.remove("is-dragging");
    } else if (pointers.size === 1 && zoom > ZOOM_MIN) {
      // Пинч закончился, остался один палец — продолжаем перетаскивание с него.
      const [a] = Array.from(pointers.values());
      dragging = true;
      dragStart = { x: a.x, y: a.y, panX, panY };
    }
  };
  dialog.addEventListener("pointerup", endPointer);
  dialog.addEventListener("pointercancel", endPointer);
}

// Модуль подключается как <script src> — инициализируемся сразу после загрузки.
initMediaViewer();

export async function openMediaInViewer(descriptor: MediaDescriptor): Promise<void> {
  const { dialog, caption, loading } = viewerElements();
  if (!dialog) return;
  resetViewer();
  if (caption) caption.textContent = descriptor.caption || descriptor.title;
  if (!dialog.open) {
    dialog.showModal();
    document.body.classList.add("dialog-open");
  }
  dialog.addEventListener("close", () => document.body.classList.remove("dialog-open"), { once: true });

  if (descriptor.publicUrl) {
    const isPdf = /\.pdf(\?|$)/i.test(descriptor.publicUrl);
    if (isPdf) showDocument(descriptor.publicUrl, descriptor.title);
    else showImage(descriptor.publicUrl, descriptor.altText || descriptor.title);
    return;
  }

  if (!descriptor.requiresSession) {
    showError("Материал недоступен.");
    return;
  }

  if (loading) loading.removeAttribute("hidden");
  currentController = createPrivateController();
  try {
    const payload = await apiPost<PrivateMediaPayload>(
      "private.media",
      { id: descriptor.mediaId, token: getToken() ?? "" },
      20_000,
      currentController.signal
    );
    if ((payload.storage === "EXTERNAL" || payload.storage === "DRIVE_PUBLIC") && payload.url) {
      if (payload.mimeType === "application/pdf") showDocument(payload.url, descriptor.title);
      else showImage(payload.url, descriptor.altText || descriptor.title);
    } else if (payload.storage === "PUBLIC_ASSET" && payload.path) {
      showImage(assetUrl(payload.path), descriptor.altText || descriptor.title);
    } else if (payload.storage === "DRIVE") {
      const objectUrl = bytesToObjectUrl(payload.base64, payload.mimeType);
      if (payload.mimeType === "application/pdf") showDocument(objectUrl, descriptor.title, objectUrl);
      else showImage(objectUrl, descriptor.altText || descriptor.title, objectUrl);
    } else {
      showError("Материал недоступен.");
    }
  } catch (error) {
    if (currentController?.signal.aborted) return;
    if (isApiError(error) && (error.status === 401 || error.code === "SESSION_INVALID")) {
      handleSessionInvalid();
      dialog.close();
      return;
    }
    showError("Материал временно недоступен.");
  }
}
