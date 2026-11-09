/** Построение URL с учётом base path GitHub Pages (/logvinov). */

function baseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  return (env?.BASE_URL ?? "/").replace(/\/$/, "");
}

export function withBase(path: string): string {
  return `${baseUrl()}/${path.replace(/^\//, "")}`;
}

export function pageUrl(page: "" | "tree" | "timeline" | "gallery"): string {
  return withBase(page === "" ? "" : `${page}/`);
}

/** URL локального ассета из public/ (assetPath из API: assets/…, media/public/…). */
export function assetUrl(assetPath: string): string {
  return withBase(assetPath);
}
