/**
 * Ленивые миниатюры семейных медиа для карточек: DRIVE-байты → Blob (кэш по mediaId)
 * → временный Object URL. Кэш живёт до смены семейного токена, URL регистрируются
 * в cleanup и отзываются при logout вместе со всей приватной страницей.
 */
import { apiPost } from "../api/client";
import type { PrivateMediaPayload } from "../api/types";
import { getToken } from "../auth/session";
import { createPrivateController, registerObjectUrl } from "./cleanup";

const blobCache = new Map<string, Promise<Blob | null>>();
let cacheToken: string | null = null;

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/** Байты закрытого DRIVE-файла; null, если файл не DRIVE или не получен. */
function getFamilyMediaBlob(mediaId: string): Promise<Blob | null> {
  const cached = blobCache.get(mediaId);
  if (cached) return cached;
  const request = (async () => {
    const controller = createPrivateController();
    try {
      const payload = await apiPost<PrivateMediaPayload>(
        "private.media",
        { id: mediaId, token: getToken() ?? "" },
        20_000,
        controller.signal
      );
      if (payload.storage !== "DRIVE") return null;
      return base64ToBlob(payload.base64, payload.mimeType);
    } catch {
      // Неудача не кэшируется: повторное открытие карточки попробует снова.
      blobCache.delete(mediaId);
      return null;
    }
  })();
  blobCache.set(mediaId, request);
  return request;
}

/**
 * Object URL миниатюры закрытого DRIVE-изображения или null (не изображение /
 * недоступно). URL нужно зарегистрировать — это делает сам модуль (cleanup при logout).
 */
export async function getFamilyThumbnail(mediaId: string): Promise<string | null> {
  // После logout/relogin прошлые Object URL отозваны — начинаем кэш заново.
  const token = getToken();
  if (token !== cacheToken) {
    blobCache.clear();
    cacheToken = token;
  }
  const blob = await getFamilyMediaBlob(mediaId);
  if (!blob || !blob.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(blob);
  registerObjectUrl(url);
  return url;
}
