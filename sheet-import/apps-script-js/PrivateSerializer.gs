function serializePrivatePerson(archive, personId) {
  const person = archive.people.get(personId);
  if (!person) {
    throw new ApiFailure(404, "PERSON_NOT_FOUND", "\u0427\u0435\u043B\u043E\u0432\u0435\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u043E\u043C \u0430\u0440\u0445\u0438\u0432\u0435.");
  }
  const exactDate = (date) => date && date.year !== null ? { date: formatIsoDate(date), precision: date.precision } : null;
  return {
    personId: person.personId,
    bio: person.familyBio || person.publicBio,
    birth: exactDate(person.birthDate),
    birthPlace: person.familyBirthPlace || person.publicBirthPlace,
    contacts: person.familyContacts,
    notes: person.familyNotes,
    materials: privatePersonMaterials(archive, personId)
  };
}
function privatePersonMaterials(archive, personId) {
  const items = [];
  archive.personMaterials.forEach((link) => {
    if (link.personId !== personId) return;
    const media = archive.media.get(link.mediaId);
    if (!media || media.visibility !== "FAMILY") return;
    items.push({
      mediaId: media.mediaId,
      title: media.title,
      category: media.category,
      role: link.role,
      dateDisplay: media.dateDisplay,
      altText: media.altText,
      caption: media.familyCaption || media.publicCaption,
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      storage: media.storage,
      // Внешние семейные ссылки выдаются только после входа.
      url: media.storage === "EXTERNAL" ? media.externalUrl : null
    });
  });
  return items;
}
function serializePrivateTimeline(archive) {
  const items = [];
  archive.events.forEach((event) => {
    if (event.visibility === "FAMILY") {
      items.push({
        eventId: event.eventId,
        eventType: event.eventType,
        title: event.title,
        date: event.displayDate,
        sortKey: event.startSortKey,
        description: event.familyDescription || event.publicDescription,
        primaryPersonId: event.primaryPersonId
      });
    } else if (event.familyDescription) {
      items.push({
        eventId: event.eventId,
        familyDescription: event.familyDescription
      });
    }
  });
  return { events: items };
}
function serializePrivateGallery(archive) {
  const items = Array.from(archive.media.values()).filter((media) => media.visibility === "FAMILY").sort((a, b) => a.sortOrder - b.sortOrder || a.sortKey - b.sortKey || a.mediaId.localeCompare(b.mediaId)).map((media) => ({
    mediaId: media.mediaId,
    title: media.title,
    category: media.category,
    mediaType: media.mediaType,
    dateDisplay: media.dateDisplay,
    altText: media.altText,
    caption: media.familyCaption || media.publicCaption,
    mimeType: media.mimeType,
    storage: media.storage,
    url: media.storage === "EXTERNAL" ? media.externalUrl : null,
    width: media.width,
    height: media.height
  }));
  return { items };
}

