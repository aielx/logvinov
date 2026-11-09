/**
 * Выдача приватных медиа: только по mediaId, только после проверки сессии.
 * driveFileId никогда не покидает сервер; байты возвращаются base64 в POST-ответе.
 */
import { MAX_MEDIA_BYTES, MEDIA_RATE_LIMIT, MEDIA_RATE_WINDOW_SECONDS } from "./Config";
import { ApiFailure, ValidatedArchive, ValidatedMedia } from "./Types";
import { tryIncrement } from "./RateLimit";

export function loadFamilyMedia(archive: ValidatedArchive, mediaId: string): object {
  if (!mediaId || !/^m_\d+$/.test(mediaId)) {
    throw new ApiFailure(400, "BAD_MEDIA_ID", "Некорректный mediaId.");
  }
  const media = archive.media.get(mediaId);
  if (!media || media.visibility !== "FAMILY") {
    // Не раскрываем существование семейного файла без сессии/при неверном id.
    throw new ApiFailure(404, "MEDIA_NOT_FOUND", "Материал не найден.");
  }
  if (!tryIncrement("media", MEDIA_RATE_LIMIT, MEDIA_RATE_WINDOW_SECONDS)) {
    throw new ApiFailure(429, "RATE_LIMITED", "Слишком много запросов материалов. Попробуйте позже.", true, MEDIA_RATE_WINDOW_SECONDS);
  }
  return serializeFamilyMediaPayload(media);
}

function serializeFamilyMediaPayload(media: ValidatedMedia): object {
  if (media.storage === "EXTERNAL" && media.externalUrl) {
    return { mediaId: media.mediaId, storage: "EXTERNAL", url: media.externalUrl, mimeType: media.mimeType };
  }
  if (media.storage === "PUBLIC_ASSET" && media.assetPath) {
    return { mediaId: media.mediaId, storage: "PUBLIC_ASSET", path: media.assetPath, mimeType: media.mimeType };
  }
  if (media.storage === "DRIVE" && media.driveFileId) {
    const file = readDriveFile(media);
    return {
      mediaId: media.mediaId,
      storage: "DRIVE",
      fileName: file.name,
      mimeType: file.mimeType,
      byteSize: file.bytes.length,
      base64: Utilities.base64Encode(file.bytes)
    };
  }
  throw new ApiFailure(404, "MEDIA_NOT_FOUND", "Материал не найден.");
}

function readDriveFile(media: ValidatedMedia): { name: string; mimeType: string; bytes: number[] } {
  let file: GoogleAppsScript.Drive.File;
  try {
    file = DriveApp.getFileById(media.driveFileId as string);
  } catch {
    throw new ApiFailure(404, "MEDIA_NOT_FOUND", "Файл недоступен; проверьте ссылку в таблице Media.");
  }
  const blob = file.getBlob();
  const bytes = Array.from(blob.getBytes()).map((b: number) => (b < 0 ? b + 256 : b));
  if (bytes.length > MAX_MEDIA_BYTES) {
    throw new ApiFailure(400, "MEDIA_TOO_LARGE", "Файл больше допустимого предела; используйте оптимизированную копию.");
  }
  return { name: file.getName(), mimeType: blob.getContentType() || "application/octet-stream", bytes };
}
