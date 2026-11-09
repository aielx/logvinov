/** Управление состояниями загрузки/ошибки/пустоты контейнеров AsyncState. */

export type AsyncUiState = "loading" | "error" | "empty" | "content";

export function setAsyncState(
  root: HTMLElement,
  state: AsyncUiState,
  options?: { message?: string; emptyTitle?: string; emptyMessage?: string }
): void {
  const slots = new Set(["loading", "error", "empty"]);
  root.querySelectorAll<HTMLElement>("[data-async]").forEach((element) => {
    const slot = element.dataset.async ?? "";
    if (slots.has(slot)) {
      element.toggleAttribute("hidden", slot !== state);
    }
  });
  const content = root.querySelector<HTMLElement>('[data-async="content"]');
  content?.toggleAttribute("hidden", state !== "content");
  const loading = root.querySelector<HTMLElement>('[data-async="loading"]');
  loading?.setAttribute("aria-busy", String(state === "loading"));
  if (options?.message) {
    root.querySelector<HTMLElement>('[data-async="error-message"]')?.replaceChildren(options.message);
  }
  if (options?.emptyTitle) {
    root.querySelector<HTMLElement>('[data-async="empty-title"]')?.replaceChildren(options.emptyTitle);
  }
  if (options?.emptyMessage) {
    root.querySelector<HTMLElement>('[data-async="empty-message"]')?.replaceChildren(options.emptyMessage);
  }
}

/** Найти контейнер по префиксу и подключить кнопку повтора. */
export function bindAsyncRoot(prefix: string, onRetry: () => void): HTMLElement | null {
  const root = document.querySelector<HTMLElement>(`[data-async-root="${prefix}"]`);
  if (!root) return null;
  root.querySelector<HTMLButtonElement>('[data-async="retry"]')?.addEventListener("click", onRetry);
  return root;
}
