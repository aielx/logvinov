/**
 * Этот файл — для копирования в веб-редактор Google Apps Script.
 * НЕ копируйте apps-script/src/*.ts: это TypeScript с import-инструкциями.
 * Сгенерировано автоматически: npm run gen:gs.
 */
function publicAvatar(_archive, person) {
  return person.publicAvatarUrl;
}
function isPubliclyDetailed(person) {
  return !person.isLiving && person.detailsVisibility === "PUBLIC";
}
function publicPersonMini(archive, person) {
  return {
    personId: person.personId,
    displayName: person.displayName,
    years: formatYears(person.birthYear, person.deathYear, person.isLiving),
    isLiving: person.isLiving
  };
}
function serializeTree(archive) {
  return {
    schemaVersion: archive.schemaVersion,
    branches: archive.branches.map((branch) => ({
      branchId: branch.branchId,
      label: branch.label,
      sortOrder: branch.sortOrder
    })),
    people: Array.from(archive.people.values()).sort((a, b) => a.generation - b.generation || a.sortOrder - b.sortOrder || a.personId.localeCompare(b.personId)).map((person) => ({
      personId: person.personId,
      displayName: person.displayName,
      birthYear: person.birthYear,
      deathYear: person.deathYear,
      isLiving: person.isLiving,
      branchId: person.branchId,
      generation: person.generation,
      sortOrder: person.sortOrder,
      years: formatYears(person.birthYear, person.deathYear, person.isLiving),
      parentIds: person.parentIds.slice(),
      spouseIds: person.spouseIds.slice(),
      childIds: person.childIds.slice(),
      hasPublicDetails: isPubliclyDetailed(person),
      avatar: publicAvatar(archive, person)
    }))
  };
}
function serializePerson(archive, personId) {
  const person = archive.people.get(personId);
  if (!person) {
    throw new ApiFailure(404, "PERSON_NOT_FOUND", "\u0427\u0435\u043B\u043E\u0432\u0435\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u043E\u043C \u0430\u0440\u0445\u0438\u0432\u0435.");
  }
  if (!isPubliclyDetailed(person)) {
    throw new ApiFailure(401, "FAMILY_ACCESS_REQUIRED", "\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0441\u0435\u043C\u0435\u0439\u043D\u043E\u043C \u0440\u0435\u0436\u0438\u043C\u0435.");
  }
  const relations = (ids, relation) => ids.map((id) => archive.people.get(id)).filter((other) => Boolean(other)).map((other) => ({ ...publicPersonMini(archive, other), relation }));
  const death = person.deathDate ? {
    date: formatIsoDate(person.deathDate),
    precision: person.deathDate.precision,
    year: person.deathDate.year
  } : null;
  const birth = person.birthDate ? {
    date: formatIsoDate(person.birthDate),
    precision: person.birthDate.precision,
    year: person.birthDate.year
  } : null;
  return {
    personId: person.personId,
    displayName: person.displayName,
    years: formatYears(person.birthYear, person.deathYear, person.isLiving),
    generation: person.generation,
    branchId: person.branchId,
    branchLabel: archive.branches.find((b) => b.branchId === person.branchId)?.label ?? null,
    bio: person.publicBio,
    birthPlace: person.publicBirthPlace,
    birth,
    death,
    avatar: publicAvatar(archive, person),
    relatives: [
      ...relations(person.parentIds, "parent"),
      ...relations(person.spouseIds, "spouse"),
      ...relations(person.childIds, "child")
    ],
    materials: publicPersonMaterials(archive, personId)
  };
}
function publicPersonMaterials(archive, personId) {
  return archive.personMaterials.filter((link) => link.personId === personId).filter((link) => {
    const media = archive.media.get(link.mediaId);
    return media !== void 0 && media.visibility === "PUBLIC";
  }).map((link) => {
    const media = archive.media.get(link.mediaId);
    return {
      mediaId: media.mediaId,
      title: media.title,
      category: media.category,
      role: link.role,
      dateDisplay: media.dateDisplay,
      altText: media.altText,
      caption: media.publicCaption,
      mediaType: media.mediaType,
      storage: media.storage,
      path: media.storage === "PUBLIC_ASSET" ? media.assetPath : null,
      // Публичные фото — прямые ссылки (EXTERNAL/DRIVE_PUBLIC); публичный файл
      // Drive c категорией «Документы» тоже требует доступа «по ссылке».
      url: media.storage === "EXTERNAL" || media.storage === "DRIVE_PUBLIC" ? media.externalUrl : media.storage === "DRIVE" ? `https://drive.google.com/uc?export=view&id=${media.driveFileId}` : null
    };
  });
}
function serializeTimeline(archive) {
  const events = [
    ...archive.events.filter((event) => event.visibility === "PUBLIC").map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      title: event.title,
      date: event.displayDate,
      sortKey: event.startSortKey,
      description: event.publicDescription,
      primaryPersonId: event.primaryPersonId
    })),
    ...deriveVitalEvents(archive).filter((vital) => vital.visibility === "PUBLIC").map(vitalTimelineEvent)
  ].sort(compareTimelineEntries);
  return { events };
}
function serializeGalleryPage(archive, offset, limit) {
  const sorted = Array.from(archive.media.values()).filter((media) => media.visibility === "PUBLIC").sort((a, b) => a.sortOrder - b.sortOrder || a.sortKey - b.sortKey || a.mediaId.localeCompare(b.mediaId));
  const page = sorted.slice(offset, offset + limit);
  return {
    items: page.map((media) => ({
      mediaId: media.mediaId,
      title: media.title,
      category: media.category,
      mediaType: media.mediaType,
      dateDisplay: media.dateDisplay,
      altText: media.altText,
      caption: media.publicCaption,
      storage: media.storage,
      path: media.storage === "PUBLIC_ASSET" ? media.assetPath : null,
      url: media.storage === "EXTERNAL" || media.storage === "DRIVE_PUBLIC" ? media.externalUrl : media.storage === "DRIVE" ? `https://drive.google.com/uc?export=view&id=${media.driveFileId}` : null,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height
    })),
    nextCursorOffset: offset + limit < sorted.length ? offset + limit : null
  };
}

