function loadFamilyMedia(archive, mediaId) {
  if (!mediaId || !/^m_\d+$/.test(mediaId)) {
    throw new ApiFailure(400, "BAD_MEDIA_ID", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 mediaId.");
  }
  const media = archive.media.get(mediaId);
  if (!media || media.visibility !== "FAMILY") {
    throw new ApiFailure(404, "MEDIA_NOT_FOUND", "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D.");
  }
  if (!tryIncrement("media", MEDIA_RATE_LIMIT, MEDIA_RATE_WINDOW_SECONDS)) {
    throw new ApiFailure(429, "RATE_LIMITED", "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.", true, MEDIA_RATE_WINDOW_SECONDS);
  }
  return serializeFamilyMediaPayload(media);
}
function serializeFamilyMediaPayload(media) {
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
  throw new ApiFailure(404, "MEDIA_NOT_FOUND", "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D.");
}
function readDriveFile(media) {
  let file;
  try {
    file = DriveApp.getFileById(media.driveFileId);
  } catch {
    throw new ApiFailure(404, "MEDIA_NOT_FOUND", "\u0424\u0430\u0439\u043B \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D; \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443 \u0432 \u0442\u0430\u0431\u043B\u0438\u0446\u0435 Media.");
  }
  const blob = file.getBlob();
  const bytes = Array.from(blob.getBytes()).map((b) => b < 0 ? b + 256 : b);
  if (bytes.length > MAX_MEDIA_BYTES) {
    throw new ApiFailure(400, "MEDIA_TOO_LARGE", "\u0424\u0430\u0439\u043B \u0431\u043E\u043B\u044C\u0448\u0435 \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E\u0433\u043E \u043F\u0440\u0435\u0434\u0435\u043B\u0430; \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u0443\u044E \u043A\u043E\u043F\u0438\u044E.");
  }
  return { name: file.getName(), mimeType: blob.getContentType() || "application/octet-stream", bytes };
}

