/**
 * Централизованное управление приватными ресурсами страницы:
 * Object URL (Blob приватных медиа) и AbortController приватных запросов.
 * После logout, отзыва или инвалидации сессии всё отзывается/отменяется.
 */

const objectUrls = new Set<string>();
const controllers = new Set<AbortController>();

export function registerObjectUrl(url: string): void {
  objectUrls.add(url);
}

export function createPrivateController(): AbortController {
  const controller = new AbortController();
  controllers.add(controller);
  return controller;
}

/** Отзыв одного URL (например, при закрытии просмотрщика). */
export function revokeObjectUrl(url: string): void {
  if (objectUrls.delete(url)) {
    URL.revokeObjectURL(url);
  }
}

/** Полная очистка приватного состояния: вызывается при logout/SESSION_INVALID. */
export function releasePrivateResources(): void {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
}

export function objectUrlCount(): number {
  return objectUrls.size;
}
