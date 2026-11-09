/**
 * Работа с датами на клиенте: только публичные годы и мягкие даты событий.
 * ISO-даты вида YYYY, YYYY-MM, YYYY-MM-DD парсятся без сдвига часовых поясов.
 */

export interface SoftDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export function parseIsoDate(value: string | null | undefined): SoftDate | null {
  if (!value) return null;
  const match = /^(\d{3,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return {
    year: Number.parseInt(match[1], 10),
    month: match[2] ? Number.parseInt(match[2], 10) : null,
    day: match[3] ? Number.parseInt(match[3], 10) : null
  };
}

/** Отображение точной даты с учётом точности: 14 марта 1937 г. / март 1937 г. / 1937 г. */
export function formatSoftDate(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  if (!date || date.year === null) return "";
  const monthsGenitive = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const monthsNominative = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  if (date.day !== null && date.month !== null) {
    return `${date.day} ${monthsGenitive[date.month - 1]} ${date.year} г.`;
  }
  if (date.month !== null) {
    return `${monthsNominative[date.month - 1]} ${date.year} г.`;
  }
  return `${date.year} г.`;
}

export function formatYears(birthYear: number | null, deathYear: number | null, isLiving: boolean): string {
  if (birthYear === null) return "годы не уточнены";
  if (isLiving) return `${birthYear}–н. в.`;
  return deathYear === null ? String(birthYear) : `${birthYear}–${deathYear}`;
}
