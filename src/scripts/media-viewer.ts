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

function viewerElements() {
  return {
    dialog: document.getElementById("media-viewer") as HTMLDialogElement | null,
    image: document.getElementById("media-viewer-image") as HTMLImageElement | null,
    caption: document.getElementById("media-viewer-caption") as HTMLParagraphElement | null,
    loading: document.getElementById("media-viewer-loading") as HTMLDivElement | null,
    error: document.getElementById("media-viewer-error") as HTMLDivElement | null,
    documentLink: document.getElementById("media-viewer-document") as HTMLAnchorElement | null
  };
}

function resetViewer(): void {
  const { image, caption, loading, error, documentLink } = viewerElements();
  if (currentObjectUrl) {
    revokeObjectUrl(currentObjectUrl);
    currentObjectUrl = null;
  }
  currentController?.abort();
  currentController = null;
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
  const { image, loading } = viewerElements();
  if (objectUrl) {
    currentObjectUrl = objectUrl;
    registerObjectUrl(objectUrl);
  }
  if (!image) return;
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
  const { documentLink, loading } = viewerElements();
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
  dialog?.addEventListener("close", () => {
    resetViewer();
  });
}

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
