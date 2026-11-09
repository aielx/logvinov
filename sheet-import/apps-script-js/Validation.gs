function issue(target, sheet, rowNumber, recordId, code, message) {
  target.issues.push({ sheet, rowNumber, recordId, code, message });
}
function normalizeBool(value) {
  if (typeof value === "boolean") return value;
  const text = toText(value).toUpperCase();
  if (["TRUE", "\u0414\u0410", "YES", "1", "+"].includes(text)) return true;
  if (["", "FALSE", "\u041D\u0415\u0422", "NO", "0", "-", "\u2014"].includes(text)) return false;
  return null;
}
function normalizeVisibility(value) {
  const text = toText(value).toLowerCase();
  if (text === "") return null;
  if (text.startsWith("\u0441\u0435\u043C\u0435\u0439\u043D")) return "FAMILY";
  if (text.startsWith("\u043F\u0443\u0431\u043B\u0438\u0447\u043D")) return "PUBLIC";
  if (text === "family") return "FAMILY";
  if (text === "public") return "PUBLIC";
  return "INVALID";
}
function normalizeEventType(value) {
  const text = toText(value).toLowerCase();
  if (text.startsWith("\u0438\u0441\u0442\u043E\u0440")) return "HISTORY";
  if (text.startsWith("\u0441\u0435\u043C\u0435\u0439\u043D") || text === "") return "FAMILY";
  if (text === "history") return "HISTORY";
  if (text === "family") return "FAMILY";
  return "INVALID";
}
function normalizeCategory(value) {
  const text = toText(value).toLowerCase();
  if (text.startsWith("\u0434\u043E\u043A")) return "documents";
  if (text.startsWith("\u043F\u043E\u0440\u0442\u0440\u0435\u0442")) return "portraits";
  if (text === "documents") return "documents";
  if (text === "portraits") return "portraits";
  return "archive";
}
function normalizeRole(value) {
  const text = toText(value).toLowerCase();
  if (text.startsWith("\u043F\u043E\u0440\u0442\u0440\u0435\u0442")) return "PORTRAIT";
  if (text.startsWith("\u0434\u043E\u043A") || text.startsWith("\u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A")) return "SOURCE";
  return "GALLERY";
}
function resolvePhoto(raw) {
  const value = toText(raw);
  if (value === "") return null;
  if (isDriveUrl(value)) {
    const id = extractDriveFileId(value);
    return id ? { storage: "DRIVE_PUBLIC", url: driveImageUrl(id, 400) } : "INVALID";
  }
  if (isSafeExternalUrl(value)) return { storage: "EXTERNAL", url: value };
  if (isSafeAssetPath(value)) return { storage: "PUBLIC_ASSET", path: value };
  return "INVALID";
}
function padId(prefix, number) {
  return `${prefix}_${String(number).padStart(4, "0")}`;
}
function parseRefNumber(value) {
  const text = toText(value);
  if (text === "") return null;
  const match = /^\s*(\d+)/.exec(text);
  return match ? parseInt(match[1], 10) : -1;
}
function validateArchive(raw) {
  const archive = {
    schemaVersion: SCHEMA_VERSION,
    dataRevision: "1",
    people: /* @__PURE__ */ new Map(),
    events: [],
    media: /* @__PURE__ */ new Map(),
    personMaterials: [],
    branches: [],
    issues: [],
    degraded: false
  };
  const drafts = validatePeople(raw, archive);
  buildRelations(archive, drafts);
  breakCycles(archive);
  computeGenerations(archive);
  archive.branches = buildBranches(archive);
  validateEvents(raw, archive, drafts);
  validateMaterials(raw, archive, drafts);
  archive.degraded = archive.issues.length > 0;
  return archive;
}
function validatePeople(raw, archive) {
  const drafts = /* @__PURE__ */ new Map();
  const sheet = "\u041B\u044E\u0434\u0438";
  raw.people.forEach((row) => {
    if (isBlank(row.fullName) && isBlank(row.number)) return;
    if (normalizeBool(row.draft) === true) return;
    const number = parseInt(toText(row.number), 10);
    if (!Number.isFinite(number) || number < 1 || number > 9999) {
      issue(archive, sheet, row.rowNumber, toText(row.number), "PERSON_NO_ID", "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D \u0443\u043D\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u2116 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 (\u043A\u043E\u043B\u043E\u043D\u043A\u0430 A). \u041F\u0440\u043E\u0449\u0435 \u0432\u0441\u0435\u0433\u043E: \u043C\u0435\u043D\u044E \xAB\u0421\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u0430\u0440\u0445\u0438\u0432 \u2192 \u041F\u0440\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043D\u043E\u043C\u0435\u0440\u0430\xBB.");
      return;
    }
    if (drafts.has(number)) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_DUPLICATE_ID", `\u2116 ${number} \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442 \u0434\u0440\u0443\u0433\u0438\u043C \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C.`);
      return;
    }
    if (isBlank(row.fullName)) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_NO_NAME", "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u0424\u0418\u041E.");
      return;
    }
    const isLiving = normalizeBool(row.isLiving);
    if (isLiving === null) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_LIVING", "\xAB\u0416\u0438\u0432\u043E\u0439\xBB \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0414\u0410/\u041D\u0415\u0422 (\u0447\u0435\u043A\u0431\u043E\u043A\u0441).");
      return;
    }
    const birth = parseFlexibleDate(row.birthDate);
    if (birth === null) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_BIRTH", `\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F \xAB${toText(row.birthDate)}\xBB (\u043D\u0443\u0436\u043D\u043E 1890, 1937-03 \u0438\u043B\u0438 1937-03-14).`);
      return;
    }
    const death = parseFlexibleDate(row.deathDate);
    if (death === null) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_DEATH", `\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430 \u0441\u043C\u0435\u0440\u0442\u0438 \xAB${toText(row.deathDate)}\xBB.`);
      return;
    }
    if (isLiving && death.year !== null) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_LIVING_WITH_DEATH", "\u0423 \u0436\u0438\u0432\u043E\u0433\u043E \u0443\u043A\u0430\u0437\u0430\u043D\u0430 \u0434\u0430\u0442\u0430 \u0441\u043C\u0435\u0440\u0442\u0438.");
      return;
    }
    if (birth.year !== null && death.year !== null && death.sortKey < birth.sortKey) {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_DIED_BEFORE_BIRTH", "\u0414\u0430\u0442\u0430 \u0441\u043C\u0435\u0440\u0442\u0438 \u0440\u0430\u043D\u044C\u0448\u0435 \u0434\u0430\u0442\u044B \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F.");
      return;
    }
    const declared = normalizeVisibility(row.cardVisibility);
    if (declared === "INVALID") {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_VISIBILITY", "\xAB\u0412\u0438\u0434\u0438\u043C\u043E\u0441\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438\xBB: \u0421\u0435\u043C\u0435\u0439\u043D\u0430\u044F \u0438\u043B\u0438 \u041F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F (\u0438\u043B\u0438 \u043F\u0443\u0441\u0442\u043E).");
      return;
    }
    let detailsVisibility;
    if (declared === "FAMILY") {
      detailsVisibility = "FAMILY";
    } else if (isLiving) {
      detailsVisibility = "FAMILY";
      if (declared === "PUBLIC") {
        issue(archive, sheet, row.rowNumber, String(number), "PERSON_LIVING_FORCED_FAMILY", "\u0414\u043B\u044F \u0436\u0438\u0432\u043E\u0433\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \xAB\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F\xBB \u2014 \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u043E\u0441\u0442\u0438 \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u0441\u0435\u043C\u0435\u0439\u043D\u044B\u043C\u0438.");
      }
    } else {
      detailsVisibility = "PUBLIC";
    }
    const photo = resolvePhoto(row.photo);
    if (photo === "INVALID") {
      issue(archive, sheet, row.rowNumber, String(number), "PERSON_BAD_PHOTO", "\xAB\u0424\u043E\u0442\u043E\xBB \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u043E\u0439 Drive, https-\u0430\u0434\u0440\u0435\u0441\u043E\u043C \u0438\u043B\u0438 \u043F\u0443\u0442\u0451\u043C assets/\u2026");
    }
    const publicAvatarUrl = photo && photo !== "INVALID" ? photo : null;
    drafts.set(number, {
      number,
      rowNumber: row.rowNumber,
      father: parseRefNumber(row.father),
      mother: parseRefNumber(row.mother),
      spouse: parseRefNumber(row.spouse),
      person: {
        personId: padId("p", number),
        displayName: toText(row.fullName),
        isLiving,
        branchId: toText(row.branch),
        publicBio: toText(row.publicBio),
        familyBio: toText(row.familyBio),
        publicBirthPlace: toText(row.publicBirthPlace),
        familyBirthPlace: toText(row.familyBirthPlace),
        familyContacts: toText(row.familyContacts),
        familyNotes: toText(row.familyNotes),
        birthYear: birth.year,
        deathYear: death.year,
        birthDate: birth.year !== null ? birth : null,
        deathDate: death.year !== null ? death : null,
        detailsVisibility,
        publicAvatarUrl,
        sortOrder: number,
        generation: 1,
        parentIds: [],
        spouseIds: [],
        childIds: []
      }
    });
  });
  drafts.forEach((draft) => {
    archive.people.set(draft.person.personId, draft.person);
  });
  return drafts;
}
function buildRelations(archive, drafts) {
  const sheet = "\u041B\u044E\u0434\u0438";
  const pairSeen = /* @__PURE__ */ new Set();
  drafts.forEach((draft) => {
    const link = (ref, kind) => {
      if (ref === null) return null;
      if (ref === -1) {
        issue(archive, sheet, draft.rowNumber, draft.person.personId, "PERSON_BAD_REF", `\u041A\u043E\u043B\u043E\u043D\u043A\u0430 \xAB${kind}\xBB: \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430 (\u0438\u043B\u0438 \u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u043E\u0439).`);
        return null;
      }
      if (ref === draft.number) {
        issue(archive, sheet, draft.rowNumber, draft.person.personId, "PERSON_SELF_REF", `\u0412 \u043A\u043E\u043B\u043E\u043D\u043A\u0435 \xAB${kind}\xBB \u0432\u044B\u0431\u0440\u0430\u043D \u0441\u0430\u043C \u0447\u0435\u043B\u043E\u0432\u0435\u043A.`);
        return null;
      }
      const other = drafts.get(ref);
      if (!other) {
        issue(archive, sheet, draft.rowNumber, draft.person.personId, "PERSON_UNKNOWN_REF", `\xAB${kind}\xBB: \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u0441 \u2116 ${ref} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D.`);
        return null;
      }
      return other;
    };
    const father = link(draft.father, "\u041E\u0442\u0435\u0446");
    const mother = link(draft.mother, "\u041C\u0430\u0442\u044C");
    [father, mother].forEach((parent) => {
      if (!parent) return;
      if (parent.person.birthYear !== null && draft.person.birthYear !== null && draft.person.birthYear - parent.person.birthYear < 13) {
        issue(archive, sheet, draft.rowNumber, draft.person.personId, "REL_IMPLAUSIBLE_AGE", `\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u044C \u2116 ${parent.number} \u043C\u043B\u0430\u0434\u0448\u0435 \u0440\u0435\u0431\u0451\u043D\u043A\u0430 \u043C\u0435\u043D\u0435\u0435 \u0447\u0435\u043C \u043D\u0430 13 \u043B\u0435\u0442 \u2014 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435.`);
      }
      draft.person.parentIds.push(parent.person.personId);
      parent.person.childIds.push(draft.person.personId);
    });
    const spouse = link(draft.spouse, "\u0421\u0443\u043F\u0440\u0443\u0433(\u0430)");
    if (spouse) {
      if (!draft.person.spouseIds.includes(spouse.person.personId)) {
        draft.person.spouseIds.push(spouse.person.personId);
      }
      if (!spouse.person.spouseIds.includes(draft.person.personId)) {
        spouse.person.spouseIds.push(draft.person.personId);
      }
      const key = [draft.person.personId, spouse.person.personId].sort().join("+");
      if (!pairSeen.has(key)) {
        pairSeen.add(key);
      }
    }
  });
}
function breakCycles(archive) {
  for (let guard = 0; guard < 200; guard += 1) {
    const cyclic = [];
    archive.people.forEach((person) => {
      person.childIds.forEach((childId) => {
        if (!descendsFrom(archive, person.personId, childId)) return;
        const child2 = archive.people.get(childId);
        if (!child2) return;
        const score = person.birthYear !== null && child2.birthYear !== null ? person.birthYear - child2.birthYear : 0;
        cyclic.push({ parent: person, childId, score });
      });
    });
    if (cyclic.length === 0) return;
    cyclic.sort((a, b) => b.score - a.score || (a.parent.personId > b.parent.personId ? 1 : -1));
    const worst = cyclic[0];
    const child = archive.people.get(worst.childId);
    if (!child) return;
    worst.parent.childIds = worst.parent.childIds.filter((c) => c !== worst.childId);
    child.parentIds = child.parentIds.filter((p) => p !== worst.parent.personId);
    issue(archive, "\u041B\u044E\u0434\u0438", 0, worst.parent.personId, "REL_CYCLE", `\u0421\u0432\u044F\u0437\u044C \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u2192\u0440\u0435\u0431\u0451\u043D\u043E\u043A ${worst.parent.personId}>${worst.childId} \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u0446\u0438\u043A\u043B \u043F\u043E\u043A\u043E\u043B\u0435\u043D\u0438\u0439 \u0438 \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0430.`);
  }
}
function descendsFrom(archive, ancestor, current) {
  const queue = [current];
  const seen = /* @__PURE__ */ new Set();
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === ancestor) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const person = archive.people.get(id);
    if (person) queue.push(...person.childIds);
  }
  return false;
}
function computeGenerations(archive) {
  const resolved = /* @__PURE__ */ new Map();
  const resolving = /* @__PURE__ */ new Set();
  const resolve = (personId) => {
    const cached = resolved.get(personId);
    if (cached !== void 0) return cached;
    if (resolving.has(personId)) return 0;
    resolving.add(personId);
    const person = archive.people.get(personId);
    let generation = 1;
    if (person && person.parentIds.length > 0) {
      generation = 1 + Math.max(...person.parentIds.map((parentId) => resolve(parentId)));
    }
    resolving.delete(personId);
    resolved.set(personId, generation);
    return generation;
  };
  archive.people.forEach((person) => {
    person.generation = resolve(person.personId);
  });
  archive.people.forEach((person) => {
    person.parentIds.forEach((parentId) => {
      const parent = archive.people.get(parentId);
      if (parent && person.generation <= parent.generation) {
        issue(archive, "\u041B\u044E\u0434\u0438", 0, person.personId, "PERSON_GENERATION_CONFLICT", `\u041F\u043E\u043A\u043E\u043B\u0435\u043D\u0438\u0435 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u2116 ${person.personId.slice(2)} \u043D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 \u043F\u043E\u043A\u043E\u043B\u0435\u043D\u0438\u044F \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u044F \u2014 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u0432\u044F\u0437\u0438.`);
      }
    });
  });
}
function buildBranches(archive) {
  const order = [];
  const push = (label) => {
    const trimmed = label.trim();
    if (trimmed && !order.includes(trimmed)) order.push(trimmed);
  };
  const sorted = Array.from(archive.people.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  sorted.forEach((person) => {
    if (person.parentIds.length === 0) push(person.branchId);
  });
  sorted.forEach((person) => push(person.branchId));
  return order.map((label, index) => ({ branchId: label, label, sortOrder: index + 1 }));
}
function validateEvents(raw, archive, drafts) {
  const sheet = "\u0421\u043E\u0431\u044B\u0442\u0438\u044F";
  raw.events.forEach((row) => {
    if (isBlank(row.title)) return;
    if (normalizeBool(row.draft) === true) return;
    const type = normalizeEventType(row.type);
    if (type === "INVALID") {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_BAD_TYPE", "\xAB\u0422\u0438\u043F\xBB: \u0421\u0435\u043C\u0435\u0439\u043D\u043E\u0435 \u0438\u043B\u0438 \u0418\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u043E\u0435.");
      return;
    }
    const visibility = normalizeVisibility(row.visibility);
    if (visibility !== "PUBLIC" && visibility !== "FAMILY") {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_BAD_VISIBILITY", "\xAB\u0412\u0438\u0434\u0438\u043C\u043E\u0441\u0442\u044C\xBB: \u041F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0435 \u0438\u043B\u0438 \u0421\u0435\u043C\u0435\u0439\u043D\u043E\u0435.");
      return;
    }
    const start = parseFlexibleDate(row.date);
    if (start === null || start.year === null) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_BAD_DATE", "\u041D\u0443\u0436\u043D\u0430 \u0445\u043E\u0442\u044F \u0431\u044B \u0434\u0430\u0442\u0430-\u0433\u043E\u0434 \u0432 \u043A\u043E\u043B\u043E\u043D\u043A\u0435 \xAB\u0414\u0430\u0442\u0430\xBB.");
      return;
    }
    const end = parseFlexibleDate(row.endDate);
    if (end === null) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_BAD_END_DATE", `\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \xAB\u041A\u043E\u043D\u0435\u0446\xBB: ${toText(row.endDate)}.`);
      return;
    }
    if (end.year !== null && end.sortKey < start.sortKey) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "EVENT_END_BEFORE_START", "\xAB\u041A\u043E\u043D\u0435\u0446\xBB \u043F\u0440\u0435\u0434\u0448\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \xAB\u0414\u0430\u0442\u0430\xBB.");
      return;
    }
    let primaryPersonId = null;
    const personRef = parseRefNumber(row.person);
    if (personRef === -1) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "PERSON_BAD_REF", "\u041A\u043E\u043B\u043E\u043D\u043A\u0430 \xAB\u0427\u0435\u043B\u043E\u0432\u0435\u043A\xBB: \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430.");
    } else if (personRef !== null) {
      const draft = drafts.get(personRef);
      if (!draft) {
        issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "PERSON_UNKNOWN_REF", `\u0427\u0435\u043B\u043E\u0432\u0435\u043A \u0441 \u2116 ${personRef} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D.`);
      } else {
        primaryPersonId = draft.person.personId;
      }
    }
    archive.events.push({
      eventId: padId("e", row.rowNumber),
      eventType: type,
      title: toText(row.title),
      displayDate: toText(row.displayDate) || (end.year !== null ? `${start.year}\u2013${end.year}` : String(start.year)),
      startSortKey: start.sortKey,
      precision: start.precision,
      publicDescription: visibility === "PUBLIC" ? toText(row.description) : "",
      familyDescription: visibility === "FAMILY" ? toText(row.description) : "",
      visibility,
      primaryPersonId,
      sortOrder: row.rowNumber
    });
  });
  archive.events.sort((a, b) => a.startSortKey - b.startSortKey || a.sortOrder - b.sortOrder || a.eventId.localeCompare(b.eventId));
}
function validateMaterials(raw, archive, drafts) {
  const sheet = "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B";
  raw.materials.forEach((row) => {
    if (isBlank(row.title)) return;
    if (normalizeBool(row.draft) === true) return;
    const visibility = normalizeVisibility(row.visibility);
    if (visibility !== "PUBLIC" && visibility !== "FAMILY") {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_BAD_VISIBILITY", "\xAB\u0412\u0438\u0434\u0438\u043C\u043E\u0441\u0442\u044C\xBB: \u041F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0435 \u0438\u043B\u0438 \u0421\u0435\u043C\u0435\u0439\u043D\u043E\u0435.");
      return;
    }
    const sourceUrl = toText(row.sourceUrl);
    const assetPath = toText(row.assetPath);
    const category = normalizeCategory(row.category);
    let storage;
    let driveFileId = null;
    let externalUrl = null;
    if (sourceUrl && isDriveUrl(sourceUrl)) {
      const driveId = extractDriveFileId(sourceUrl);
      if (!driveId) {
        issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_BAD_DRIVE_URL", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0438\u0437\u0432\u043B\u0435\u0447\u044C ID \u0444\u0430\u0439\u043B\u0430 \u0438\u0437 \u0441\u0441\u044B\u043B\u043A\u0438 Drive (\u043D\u0443\u0436\u043D\u0430 \u0441\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u0444\u0430\u0439\u043B, \u043D\u0435 \u043D\u0430 \u043F\u0430\u043F\u043A\u0443).");
        return;
      }
      if (category === "documents") {
        storage = "DRIVE";
        driveFileId = driveId;
      } else {
        storage = "DRIVE_PUBLIC";
        externalUrl = driveImageUrl(driveId, 1200);
      }
    } else if (sourceUrl) {
      if (!isSafeExternalUrl(sourceUrl)) {
        issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_UNSAFE_URL", "\xAB\u0421\u0441\u044B\u043B\u043A\u0430\xBB \u0434\u043E\u043B\u0436\u043D\u0430 \u043D\u0430\u0447\u0438\u043D\u0430\u0442\u044C\u0441\u044F \u0441 https://");
        return;
      }
      storage = "EXTERNAL";
      externalUrl = sourceUrl;
    } else if (assetPath) {
      if (!isSafeAssetPath(assetPath)) {
        issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_BAD_ASSET_PATH", "\xAB\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0443\u0442\u044C\xBB \u0434\u043E\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E assets/\u2026 \u0438\u043B\u0438 media/public/\u2026");
        return;
      }
      storage = "PUBLIC_ASSET";
    } else {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_NO_SOURCE", "\u041D\u0443\u0436\u043D\u0430 \xAB\u0421\u0441\u044B\u043B\u043A\u0430\xBB (Drive/https) \u0438\u043B\u0438 \xAB\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0443\u0442\u044C\xBB.");
      return;
    }
    const isPdf = /\.pdf(\?|$)/i.test(sourceUrl) || /\.pdf$/i.test(assetPath);
    const mimeType = isPdf ? "application/pdf" : storage === "PUBLIC_ASSET" && assetPath.endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      issue(archive, sheet, row.rowNumber, toText(row.title).slice(0, 40), "MEDIA_BAD_MIME", "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0442\u0438\u043F \u0444\u0430\u0439\u043B\u0430.");
      return;
    }
    const sortKey = parseFlexibleDate(row.date)?.year ?? 0;
    const mediaId = padId("m", row.rowNumber);
    archive.media.set(mediaId, {
      mediaId,
      title: toText(row.title),
      category,
      mediaType: isPdf ? "document" : "image",
      visibility,
      storage,
      assetPath: storage === "PUBLIC_ASSET" ? assetPath : null,
      driveFileId,
      externalUrl,
      mimeType,
      dateDisplay: toText(row.date),
      sortKey,
      altText: toText(row.title),
      publicCaption: visibility === "PUBLIC" ? toText(row.caption) : "",
      familyCaption: toText(row.caption),
      width: null,
      height: null,
      sortOrder: row.rowNumber
    });
    const personRef = parseRefNumber(row.person);
    if (personRef === -1) {
      issue(archive, sheet, row.rowNumber, mediaId, "PERSON_BAD_REF", "\u041A\u043E\u043B\u043E\u043D\u043A\u0430 \xAB\u0427\u0435\u0439 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\xBB: \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430.");
    } else if (personRef !== null) {
      const draft = drafts.get(personRef);
      if (!draft) {
        issue(archive, sheet, row.rowNumber, mediaId, "PERSON_UNKNOWN_REF", `\u0427\u0435\u043B\u043E\u0432\u0435\u043A \u0441 \u2116 ${personRef} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D.`);
      } else {
        archive.personMaterials.push({
          personId: draft.person.personId,
          mediaId,
          role: normalizeRole(row.role),
          sortOrder: row.rowNumber
        });
      }
    }
  });
}

