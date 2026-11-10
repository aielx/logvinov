/**
 * Этот файл — для копирования в веб-редактор Google Apps Script.
 * НЕ копируйте apps-script/src/*.ts: это TypeScript с import-инструкциями.
 * Сгенерировано автоматически: npm run gen:gs.
 */
function isPublicVital(person) {
  return !person.isLiving && person.detailsVisibility === "PUBLIC";
}
function manualPersonYears(archive) {
  const years = /* @__PURE__ */ new Set();
  archive.events.forEach((event) => {
    if (!event.primaryPersonId) return;
    years.add(`${event.primaryPersonId}|${Math.floor(event.startSortKey / 1e4)}`);
  });
  return years;
}
function compareVital(a, b) {
  return a.sortKey - b.sortKey || a.eventId.localeCompare(b.eventId);
}
function toTimelineEvent(vital) {
  return {
    eventId: vital.eventId,
    eventType: "FAMILY",
    kind: vital.kind,
    title: vital.title,
    date: vital.date,
    sortKey: vital.sortKey,
    description: "",
    primaryPersonId: vital.primaryPersonId
  };
}
function deriveVitalEvents(archive) {
  const manualYears = manualPersonYears(archive);
  const result = [];
  const push = (person, kind, date) => {
    if (!date || date.year === null) return;
    if (manualYears.has(`${person.personId}|${date.year}`)) return;
    result.push({
      eventId: `auto-${kind.toLowerCase()}-${person.personId}`,
      kind,
      title: person.displayName,
      date: formatIsoDate(date) ?? String(date.year),
      sortKey: date.sortKey,
      visibility: isPublicVital(person) ? "PUBLIC" : "FAMILY",
      primaryPersonId: person.personId
    });
  };
  archive.people.forEach((person) => {
    push(person, "BIRTH", person.birthDate);
    push(person, "DEATH", person.deathDate);
  });
  return result.sort(compareVital);
}
function vitalTimelineEvent(vital) {
  return toTimelineEvent(vital);
}
function compareTimelineEntries(a, b) {
  const vitalRank = (entry) => entry.kind === void 0 ? 0 : 1;
  return a.sortKey - b.sortKey || vitalRank(a) - vitalRank(b) || a.eventId.localeCompare(b.eventId);
}

