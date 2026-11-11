/**
 * Метаданные сайта и сборка structured data (JSON-LD) для поисковых систем
 * и ИИ-агентов. Все данные — только публичные, без семейной приватной информации.
 */

export const SITE_NAME = "Род Логвиновых";
export const SITE_TAGLINE = "Семейный генеалогический архив";
export const SITE_DESCRIPTION =
  "Семейный генеалогический архив рода Логвиновых: интерактивное древо, хронология семьи и галерея фотографий.";
export const SITE_OWNER_NAME = "Александр Сергеевич Логвинов";
export const SITE_OWNER_EMAIL = "logvinovaleksander@gmail.com";

/** Публичные разделы архива для навигации в JSON-LD. */
export const SITE_SECTIONS = [
  { path: "/", name: "Главная рода Логвиновых" },
  { path: "/tree/", name: "Семейное древо" },
  { path: "/timeline/", name: "Хронология рода" },
  { path: "/gallery/", name: "Семейная галерея" }
] as const;

type JsonLdNode = Record<string, unknown>;

/** Канонический URL со слэшем на конце (как отдаёт GitHub Pages). */
export function canonicalUrlOf(pathname: string, siteUrl: URL): URL {
  return new URL(pathname.replace(/\/?$/, "/"), siteUrl);
}

/** Общий узел WebSite: имя, язык, описание и хранитель архива. */
export function websiteNode(siteUrl: URL, description: string): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": `${siteUrl.href}#website`,
    url: siteUrl.href,
    name: SITE_NAME,
    alternateName: "Семейный архив Логвиновых",
    description,
    inLanguage: "ru-RU",
    publisher: personNode()
  };
}

/** Узел конкретной страницы: тип, заголовок, описание, язык. */
export function webPageNode(
  pageType: "WebPage" | "AboutPage" | "CollectionPage",
  pageUrl: string,
  name: string,
  description: string
): JsonLdNode {
  return {
    "@type": pageType,
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name,
    description,
    inLanguage: "ru-RU",
    isPartOf: { "@id": `${new URL(pageUrl).origin}/#website` }
  };
}

/**
 * Список разделов архива для главной: помогает поисковикам и агентам
 * понять структуру сайта (древо, хронология, галерея).
 */
export function sectionsItemListNode(siteUrl: URL): JsonLdNode {
  return {
    "@type": "ItemList",
    "@id": `${siteUrl.href}#sections`,
    name: "Разделы семейного архива рода Логвиновых",
    itemListElement: SITE_SECTIONS.map((section, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: section.name,
      url: new URL(section.path, siteUrl).href
    }))
  };
}

export type FaqEntry = { question: string; answer: string };

/** FAQ со главной: прямые ответы на типовые вопросы о роде и архиве. */
export function faqNode(pageUrlHref: string, entries: readonly FaqEntry[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    "@id": `${pageUrlHref}#faq`,
    mainEntity: entries.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer }
    }))
  };
}

/** Хранитель архива как Person — публичные контакты уже указаны в футере сайта. */
export function personNode(): JsonLdNode {
  return {
    "@type": "Person",
    "@id": "/#keeper",
    name: SITE_OWNER_NAME,
    email: `mailto:${SITE_OWNER_EMAIL}`,
    familyName: "Логвинов",
    knowsAbout: ["генеалогия", "семейная история рода Логвиновых"]
  };
}

/** Собрать @graph из узлов в один объект JSON-LD. */
export function jsonLdGraph(siteUrl: URL, description: string, nodes: JsonLdNode[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": [websiteNode(siteUrl, description), ...nodes]
  };
}
