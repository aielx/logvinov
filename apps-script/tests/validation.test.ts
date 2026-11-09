import { describe, expect, it } from "vitest";
import { validateArchive } from "../src/Validation";
import { autoFillOnEdit, missingRequiredHeaders, recordsFromValues } from "../src/SheetsRepository";
import { SHEETS } from "../src/Config";
import { parseFlexibleDate, extractDriveFileId, isSafeExternalUrl, isSafeAssetPath, formatYears } from "../src/Util";
import { SpreadsheetAppMock, resetMockState, setMockSheets } from "./globals-mock";
import { demoSheetValues } from "./fixture";
import type { RawRecords } from "../src/Types";

function demoRecords(): RawRecords {
  const values = demoSheetValues();
  return {
    people: recordsFromValues(SHEETS.PEOPLE, values[SHEETS.PEOPLE]) as never,
    events: recordsFromValues(SHEETS.EVENTS, values[SHEETS.EVENTS]) as never,
    materials: recordsFromValues(SHEETS.MATERIALS, values[SHEETS.MATERIALS]) as never,
    schemaErrors: []
  };
}

describe("Разбор дат", () => {
  it("YYYY, YYYY-MM, YYYY-MM-DD без сдвига", () => {
    expect(parseFlexibleDate("1890")).toMatchObject({ year: 1890, month: null, day: null, precision: "YEAR", sortKey: 18900000 });
    expect(parseFlexibleDate("1937-03")).toMatchObject({ year: 1937, month: 3, day: null, precision: "MONTH", sortKey: 19370300 });
    expect(parseFlexibleDate("1937-03-14")).toMatchObject({ year: 1937, month: 3, day: 14, precision: "DAY", sortKey: 19370314 });
    expect(parseFlexibleDate("")).toMatchObject({ year: null, sortKey: 0 });
  });

  it("русский формат ДД.ММ.ГГГГ принимается (привычка редакторов)", () => {
    expect(parseFlexibleDate("09.11.1984")).toMatchObject({ year: 1984, month: 11, day: 9, precision: "DAY", sortKey: 19841109 });
    expect(parseFlexibleDate("14.03.1937")).toMatchObject({ year: 1937, month: 3, day: 14, precision: "DAY", sortKey: 19370314 });
    expect(parseFlexibleDate("1.5.1920")).toMatchObject({ year: 1920, month: 5, day: 1, precision: "DAY", sortKey: 19200501 });
  });

  it("мусор отклоняется", () => {
    expect(parseFlexibleDate("31.02.1937")).toBeNull();
    expect(parseFlexibleDate("14.03.37")).toBeNull();
    expect(parseFlexibleDate("1937-13")).toBeNull();
    expect(parseFlexibleDate("abc")).toBeNull();
  });

  it("формат публичных лет", () => {
    expect(formatYears(1890, 1955, false)).toBe("1890–1955");
    expect(formatYears(1975, null, true)).toBe("1975–н. в.");
    expect(formatYears(null, null, true)).toBe("годы не уточнены");
  });
});

describe("Извлечение Drive ID и проверка URL", () => {
  it("поддерживаемые форматы ссылок", () => {
    expect(extractDriveFileId("https://drive.google.com/file/d/ABCdef1234567890/view")).toBe("ABCdef1234567890");
    expect(extractDriveFileId("https://drive.google.com/open?id=XYZ1234567890abc")).toBe("XYZ1234567890abc");
    expect(extractDriveFileId("https://example.org/file/d/short")).toBeNull();
  });

  it("только https и безопасные assetPath", () => {
    expect(isSafeExternalUrl("https://example.org/a.jpg")).toBe(true);
    expect(isSafeExternalUrl("http://example.org/a.jpg")).toBe(false);
    expect(isSafeAssetPath("assets/portrait.svg")).toBe(true);
    expect(isSafeAssetPath("media/public/x.jpg")).toBe(true);
    expect(isSafeAssetPath("../secret")).toBe(false);
  });
});

describe("Единообразные публичные фото-ссылки", () => {
  const driveLink = "https://drive.google.com/file/d/ABCdef1234567890/view";

  function materialRow(rowNumber: number, overrides: Record<string, string>) {
    return {
      rowNumber, title: "Материал", caption: "", date: "2000", category: "Фотоархив",
      visibility: "Публичное", sourceUrl: "", assetPath: "", person: "", role: "Галерея", draft: "FALSE",
      ...overrides
    };
  }

  it("Drive-ссылка в «Фото» человека превращается в прямую картинку", () => {
    const raw = demoRecords();
    (raw.people[0] as { photo: string }).photo = driveLink;
    const archive = validateArchive(raw);
    const avatar = (archive.people.get("p_0001") as { publicAvatarUrl: { storage: string; url: string } }).publicAvatarUrl;
    expect(avatar.storage).toBe("DRIVE_PUBLIC");
    expect(avatar.url).toBe("https://drive.google.com/thumbnail?id=ABCdef1234567890&sz=w400");
  });

  it("фото из Drive (Фотоархив) — публичная ссылка; документ из Drive — закрытый прокси", () => {
    const raw = demoRecords();
    (raw.materials as never[]).push(
      materialRow(41, { title: "Фото из Drive", category: "Фотоархив", sourceUrl: driveLink }) as never,
      materialRow(42, { title: "Документ из Drive", category: "Документы", sourceUrl: driveLink, visibility: "Семейное" }) as never
    );
    const archive = validateArchive(raw);
    const photo = archive.media.get("m_0041") as { storage: string; externalUrl: string | null; driveFileId: string | null };
    const doc = archive.media.get("m_0042") as { storage: string; externalUrl: string | null; driveFileId: string | null };
    expect(photo.storage).toBe("DRIVE_PUBLIC");
    expect(photo.externalUrl).toBe("https://drive.google.com/thumbnail?id=ABCdef1234567890&sz=w1200");
    expect(photo.driveFileId).toBeNull();
    expect(doc.storage).toBe("DRIVE");
    expect(doc.driveFileId).toBe("ABCdef1234567890");
    expect(doc.externalUrl).toBeNull();
    expect(archive.issues.some((i) => i.code === "MEDIA_BAD_DRIVE_URL")).toBe(false);
  });

  it("ссылка на папку Drive отклоняется с понятной ошибкой", () => {
    const raw = demoRecords();
    (raw.materials as never[]).push(materialRow(41, { title: "Папка", sourceUrl: "https://drive.google.com/drive/u/0/folders/1b-xyz" }) as never);
    const archive = validateArchive(raw);
    expect(archive.issues.some((i) => i.code === "MEDIA_BAD_DRIVE_URL")).toBe(true);
    expect(archive.media.has("m_0041")).toBe(false);
  });
});

describe("Валидация демо-датасета v2", () => {
  it("проходит без ошибок: 10 человек, 4 поколения, обе ветви, оба родителя", () => {
    const archive = validateArchive(demoRecords());
    expect(archive.issues).toEqual([]);
    expect(archive.people.size).toBe(10);
    const ivan = archive.people.get("p_0003") as { generation: number; parentIds: string[] };
    expect(ivan.generation).toBe(2);
    expect(ivan.parentIds.sort()).toEqual(["p_0001", "p_0002"]);
    expect((archive.people.get("p_0008") as { generation: number }).generation).toBe(4);
    expect((archive.people.get("p_0001") as { spouseIds: string[] }).spouseIds).toEqual(["p_0002"]);
    expect(archive.events.length).toBe(12);
    expect(archive.media.size).toBe(11);
    expect(archive.personMaterials.length).toBe(11);
  });

  it("ветви: первыми идут ветви корней (общие предки), branchId = подпись", () => {
    const archive = validateArchive(demoRecords());
    expect(archive.branches[0]).toMatchObject({ branchId: "Общие предки", label: "Общие предки" });
    expect(archive.branches.map((branch) => branch.branchId)).toEqual(["Общие предки", "Ветвь Ивана", "Ветвь Петра"]);
  });

  it("умерший без «Видимости карточки» публичен; живой всегда семейный", () => {
    const archive = validateArchive(demoRecords());
    expect((archive.people.get("p_0001") as { detailsVisibility: string }).detailsVisibility).toBe("PUBLIC");
    expect((archive.people.get("p_0008") as { detailsVisibility: string }).detailsVisibility).toBe("FAMILY");
    expect((archive.people.get("p_0006") as { detailsVisibility: string }).detailsVisibility).toBe("FAMILY");
  });

  it("событие «Семейное» не публикуется, но доступно после входа", () => {
    const archive = validateArchive(demoRecords());
    const family = archive.events.find((event) => event.familyDescription.includes("CANARY"));
    expect(family?.visibility).toBe("FAMILY");
    expect(archive.events.filter((event) => event.visibility === "PUBLIC")).toHaveLength(11);
  });
});

describe("Ошибочные записи исключаются", () => {
  it("дубликат № и человек без №", () => {
    const raw = demoRecords();
    // Копия человека № 2 с тем же №.
    const cloneRow = { ...(raw.people[1] as object), rowNumber: 99 } as never;
    (raw.people as never[]).push(cloneRow);
    // Строка без №.
    (raw.people as never[]).push({
      rowNumber: 60, number: "", fullName: "Безномеров", birthDate: "1900", deathDate: "", isLiving: "TRUE",
      branch: "", father: "", mother: "", spouse: "", publicBio: "", familyBio: "",
      publicBirthPlace: "", familyBirthPlace: "", familyContacts: "", familyNotes: "", photo: "",
      cardVisibility: "", draft: "FALSE"
    } as never);
    const archive = validateArchive(raw);
    expect(archive.issues.some((i) => i.code === "PERSON_DUPLICATE_ID")).toBe(true);
    expect(archive.issues.some((i) => i.code === "PERSON_NO_ID")).toBe(true);
    expect(archive.people.size).toBe(10);
  });

  it("ссылка на несуществующий № и на самого себя", () => {
    const raw = demoRecords();
    (raw.people[2] as { father: string }).father = "777";
    (raw.people[2] as { spouse: string }).spouse = "3";
    const archive = validateArchive(raw);
    expect(archive.issues.some((i) => i.code === "PERSON_UNKNOWN_REF")).toBe(true);
    expect(archive.issues.some((i) => i.code === "PERSON_SELF_REF")).toBe(true);
    expect((archive.people.get("p_0003") as { parentIds: string[] }).parentIds).toEqual(["p_0002"]);
  });

  it("цикл поколений: замыкающее ребро отброшено", () => {
    const raw = demoRecords();
    // Ребёнок №8 становится родителем №1 → цикл 1→3→7→8→1
    (raw.people[0] as { father: string }).father = "8";
    const archive = validateArchive(raw);
    expect(archive.issues.some((i) => i.code === "REL_CYCLE")).toBe(true);
    const p1 = archive.people.get("p_0001") as { parentIds: string[] };
    expect(p1.parentIds).not.toContain("p_0008");
  });

  it("живой с датой смерти исключается; смерть раньше рождения исключается", () => {
    const raw = demoRecords();
    (raw.people as never[]).push({
      rowNumber: 61, number: "100", fullName: "Живой с датой", birthDate: "1980", deathDate: "2000", isLiving: "TRUE",
      branch: "", father: "", mother: "", spouse: "", publicBio: "", familyBio: "",
      publicBirthPlace: "", familyBirthPlace: "", familyContacts: "", familyNotes: "", photo: "",
      cardVisibility: "", draft: "FALSE"
    } as never);
    (raw.people as never[]).push({
      rowNumber: 62, number: "101", fullName: "Даты перепутаны", birthDate: "1950", deathDate: "1930", isLiving: "FALSE",
      branch: "", father: "", mother: "", spouse: "", publicBio: "", familyBio: "",
      publicBirthPlace: "", familyBirthPlace: "", familyContacts: "", familyNotes: "", photo: "",
      cardVisibility: "", draft: "FALSE"
    } as never);
    const archive = validateArchive(raw);
    expect(archive.people.has("p_0100")).toBe(false);
    expect(archive.people.has("p_0101")).toBe(false);
    expect(archive.issues.some((i) => i.code === "PERSON_LIVING_WITH_DEATH")).toBe(true);
    expect(archive.issues.some((i) => i.code === "PERSON_DIED_BEFORE_BIRTH")).toBe(true);
  });

  it("ошибочная «Публичная» у живого принудительно семейная", () => {
    const raw = demoRecords();
    (raw.people[7] as { cardVisibility: string }).cardVisibility = "Публичная";
    const archive = validateArchive(raw);
    expect((archive.people.get("p_0008") as { detailsVisibility: string }).detailsVisibility).toBe("FAMILY");
    expect(archive.issues.some((i) => i.code === "PERSON_LIVING_FORCED_FAMILY")).toBe(true);
  });

  it("плохое фото и http-ссылка материала отклоняются", () => {
    const raw = demoRecords();
    (raw.people[0] as { photo: string }).photo = "http://insecure.example/p.jpg";
    (raw.materials as never[]).push({
      rowNumber: 90, title: "HTTP-ссылка", caption: "", date: "2000", category: "Фотоархив",
      visibility: "Публичное", sourceUrl: "http://insecure.example/x.jpg", assetPath: "", person: "",
      role: "Галерея", draft: "FALSE"
    } as never);
    const archive = validateArchive(raw);
    expect(archive.issues.some((i) => i.code === "PERSON_BAD_PHOTO")).toBe(true);
    expect((archive.people.get("p_0001") as { publicAvatarUrl: unknown }).publicAvatarUrl).toBeNull();
    expect(archive.issues.some((i) => i.code === "MEDIA_UNSAFE_URL")).toBe(true);
  });

  it("несколько корней и несвязанные компоненты не ломают построение", () => {
    const raw = demoRecords();
    (raw.people as never[]).push(
      { rowNumber: 70, number: "50", fullName: "Корень А", birthDate: "1900", deathDate: "1970", isLiving: "FALSE", branch: "Ветвь Д", father: "", mother: "", spouse: "51 · Корень Б", publicBio: "", familyBio: "", publicBirthPlace: "", familyBirthPlace: "", familyContacts: "", familyNotes: "", photo: "", cardVisibility: "", draft: "FALSE" } as never,
      { rowNumber: 71, number: "51", fullName: "Корень Б", birthDate: "1902", deathDate: "1972", isLiving: "FALSE", branch: "Ветвь Д", father: "", mother: "", spouse: "50 · Корень А", publicBio: "", familyBio: "", publicBirthPlace: "", familyBirthPlace: "", familyContacts: "", familyNotes: "", photo: "", cardVisibility: "", draft: "FALSE" } as never,
      { rowNumber: 72, number: "52", fullName: "Ребёнок АБ", birthDate: "1930", deathDate: "2000", isLiving: "FALSE", branch: "Ветвь Д", father: "50 · Корень А", mother: "51 · Корень Б", spouse: "", publicBio: "", familyBio: "", publicBirthPlace: "", familyBirthPlace: "", familyContacts: "", familyNotes: "", photo: "", cardVisibility: "", draft: "FALSE" } as never
    );
    const archive = validateArchive(raw);
    expect(archive.people.size).toBe(13);
    expect((archive.people.get("p_0052") as { generation: number }).generation).toBe(2);
    expect((archive.people.get("p_0052") as { parentIds: string[] }).parentIds.length).toBe(2);
    expect(archive.branches.map((b) => b.branchId)).toContain("Ветвь Д");
  });

  it("«Черновик» скрывает запись без ошибки", () => {
    const raw = demoRecords();
    (raw.people as never[]).push({
      rowNumber: 80, number: "60", fullName: "Черновик", birthDate: "", deathDate: "", isLiving: "TRUE",
      branch: "", father: "", mother: "", spouse: "", publicBio: "", familyBio: "",
      publicBirthPlace: "", familyBirthPlace: "", familyContacts: "", familyNotes: "", photo: "",
      cardVisibility: "", draft: "TRUE"
    } as never);
    const archive = validateArchive(raw);
    expect(archive.people.has("p_0060")).toBe(false);
    expect(archive.issues.filter((i) => i.sheet === "Люди")).toEqual([]);
  });
});

describe("Привязка к заголовкам (не к позициям)", () => {
  it("перемешанные и лишние колонки читаются корректно", () => {
    const values = [
      ["ФИО", "ЛИШНЕЕ", "№", "Живой", "Дата рождения"],
      ["Тестов Тест Тестович", "мусор", 7, true, "1900"],
      ["", "", "", "", ""]
    ];
    const rows = recordsFromValues("Люди", values);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      number: "7",
      fullName: "Тестов Тест Тестович",
      isLiving: "TRUE",
      birthDate: "1900"
    });
  });

  it("отсутствие обязательных заголовков обнаруживается", () => {
    expect(missingRequiredHeaders("Люди", [["ФИО", "Дата рождения"]])).toEqual(["№"]);
    expect(missingRequiredHeaders("Люди", [["№", "ФИО"]])).toEqual([]);
    expect(missingRequiredHeaders("События", [["Заголовок"]])).toEqual(["Дата"]);
  });
});

describe("onEdit: новый человек получает № и попадает в подстановку", () => {
  interface MockSheet {
    getRange(row: number, col: number, numRows?: number, numCols?: number): { getValue(): unknown; getValues(): unknown[][] };
  }

  function sheetWithStaticChoice(): { values: Record<string, unknown[][]>; sheet: MockSheet } {
    resetMockState();
    const values = demoSheetValues();
    (values[SHEETS.PEOPLE][0] as unknown[]).push("Выбор");
    // Статический режим «Выбора» (формула не прижилась): значения только для текущих людей.
    for (let index = 1; index <= 10; index += 1) {
      const row = values[SHEETS.PEOPLE][index] as unknown[];
      row[18] = `${row[0]} · ${row[1]}`;
    }
    setMockSheets(values);
    const active = SpreadsheetAppMock.getActive() as { getSheetByName(name: string): unknown };
    const sheet = active.getSheetByName(SHEETS.PEOPLE) as unknown as MockSheet;
    return { values, sheet };
  }

  function editEvent(sheet: unknown, row: number, numRows: number): never {
    return {
      range: { getSheet: () => sheet, getRow: () => row, getNumRows: () => numRows }
    } as never;
  }

  it("ввод ФИО в новой строке: № сам и «Выбор» обновляется (статический режим)", () => {
    const { values, sheet } = sheetWithStaticChoice();
    (values[SHEETS.PEOPLE] as unknown[][]).push(["", "ЛОГВИНОВ Александр Сергеевич", "09.11.1984", "", false, "Ветвь Петра"]);
    autoFillOnEdit(editEvent(sheet, 12, 1));
    expect(sheet.getRange(12, 1).getValue()).toBe(11);
    expect(sheet.getRange(12, 19).getValue()).toBe("11 · ЛОГВИНОВ Александр Сергеевич");
    // Дата с точками валидна: человек №11 попадает в архив.
    const archive = validateArchive({
      people: recordsFromValues(SHEETS.PEOPLE, values[SHEETS.PEOPLE]) as never,
      events: [],
      materials: [],
      schemaErrors: []
    });
    expect(archive.people.has("p_0011")).toBe(true);
    expect((archive.people.get("p_0011") as { birthDate: { precision: string } | null }).birthDate?.precision).toBe("DAY");
  });

  it("вставка нескольких строк сразу: № каждой строке одним заходом", () => {
    const { values, sheet } = sheetWithStaticChoice();
    (values[SHEETS.PEOPLE] as unknown[][]).push(
      ["", "ЛОГВИНОВ Александр Сергеевич", "1984", "", true, "Ветвь Петра"],
      ["", "Логвинова Мария Викторовна", "1964", "", true, "Ветвь Петра"]
    );
    autoFillOnEdit(editEvent(sheet, 12, 2));
    expect(sheet.getRange(12, 1).getValue()).toBe(11);
    expect(sheet.getRange(13, 1).getValue()).toBe(12);
    expect(sheet.getRange(12, 19).getValue()).toBe("11 · ЛОГВИНОВ Александр Сергеевич");
    expect(sheet.getRange(13, 19).getValue()).toBe("12 · Логвинова Мария Викторовна");
  });
});
