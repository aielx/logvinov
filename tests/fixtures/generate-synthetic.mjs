/**
 * Синтетический нагрузочный набор (план, раздел 8 «Нагрузочная проверка»):
 *   200 человек, 6–7 поколений, несколько ветвей и корней, ≥250 связей,
 *   300 публичных медиа, смешанные Drive/внешние источники.
 *
 * Генерирует tests/fixtures/mock-api/data.synthetic.json для локального mock-API:
 *   node tests/fixtures/generate-synthetic.mjs
 * Запуск нагрузочного e2e:  E2E_LOAD=1 npm run test:e2e -- load
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// Детерминированный ГПСЧ: одинаковый набор при каждом запуске.
let seed = 20260101;
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function randomInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}
function pick(list) {
  return list[randomInt(0, list.length - 1)];
}

const MALE = ["Иван", "Пётр", "Сергей", "Алексей", "Борис", "Дмитрий", "Николай", "Василий", "Андрей", "Михаил"];
const FEMALE = ["Мария", "Анна", "Екатерина", "Ольга", "Татьяна", "Наталья", "Ирина", "Елена", "Зинаида", "Вера"];
const PATRONYMIC_M = ["Иванович", "Петрович", "Сергеевич", "Алексеевич", "Борисович", "Дмитриевич", "Николаевич"];
const PATRONYMIC_F = ["Ивановна", "Петровна", "Сергеевна", "Алексеевна", "Борисовна", "Дмитриевна", "Николаевна"];

const people = [];
const details = [];
const relationships = [];
const events = [];
const media = [];
const personMedia = [];
const branches = [
  { branchId: "b_common", label: "Общие предки", sortOrder: 1 },
  { branchId: "b_syn1", label: "Ветвь А", sortOrder: 2 },
  { branchId: "b_syn2", label: "Ветвь Б", sortOrder: 3 },
  { branchId: "b_syn3", label: "Ветвь В", sortOrder: 4 }
];

const TOTAL = 200;
const GENERATIONS = 7;

function nameFor(personId, isMale) {
  const first = isMale ? pick(MALE) : pick(FEMALE);
  const patronymic = isMale ? pick(PATRONYMIC_M) : pick(PATRONYMIC_F);
  return `${first} ${patronymic} Синтетиков`;
}

// Строим 4 независимых корневых компонента с глубиной до 7 поколений.
let id = 0;
function addPerson(generation, branchId, parentIds, spouseOf) {
  id += 1;
  const personId = `p_${String(id).padStart(4, "0")}`;
  const isMale = random() > 0.5;
  const baseYear = 1890 + (generation - 1) * randomInt(24, 32);
  const birthYear = baseYear + randomInt(-4, 4);
  const isLiving = generation >= GENERATIONS - 1 && random() > 0.45;
  const deathYear = isLiving ? null : birthYear + randomInt(40, 85);
  const displayName = nameFor(personId, isMale);
  people.push({
    personId,
    displayName,
    birthYear,
    deathYear,
    isLiving,
    branchId,
    generation,
    sortOrder: id,
    years: isLiving ? `${birthYear}–н. в.` : `${birthYear}–${deathYear}`,
    parentIds: [...parentIds],
    spouseIds: spouseOf ? [spouseOf] : [],
    childIds: [],
    detailsVisibility: isLiving ? "FAMILY" : random() > 0.92 ? "FAMILY" : "PUBLIC",
    birthDate: String(birthYear),
    deathDate: deathYear === null ? "" : String(deathYear),
    publicAvatarMediaId: ""
  });
  details.push({
    personId,
    publicBio: isLiving ? "" : `Публичная биография синтетического родственника ${personId}.`,
    familyBio: `СЕМЕЙНЫЕ ДАННЫЕ (CANARY ${personId}): семейная биография.`,
    publicBirthPlace: isLiving ? "" : "с. Синтетово",
    familyBirthPlace: `СЕМЕЙНЫЕ ДАННЫЕ (CANARY ${personId}): место рождения.`,
    familyContacts: "",
    familyNotes: ""
  });
  parentIds.forEach((parentId) => {
    const parent = people.find((p) => p.personId === parentId);
    if (parent) parent.childIds.push(personId);
    relationships.push({ from: parentId, to: personId, type: "PARENT_CHILD" });
  });
  if (spouseOf) {
    const spouse = people.find((p) => p.personId === spouseOf);
    if (spouse) spouse.spouseIds.push(personId);
    relationships.push({ from: spouseOf, to: personId, type: "SPOUSE" });
  }
  return personId;
}

// Компоненты: 4 независимые пары корней; дети привязаны к обоим родителям,
// большинство детей сами образуют пары — так набирается глубина 6–7 поколений
// и ≥250 связей при 200 людях.
for (let component = 0; component < 4; component += 1) {
  const branchId = branches[Math.min(component + 1, branches.length - 1)].branchId;
  const rootA = addPerson(1, "b_common", [], null);
  const rootB = addPerson(1, "b_common", [], rootA);
  let couples = [[rootA, rootB]];
  for (let generation = 2; generation <= GENERATIONS; generation += 1) {
    const nextCouples = [];
    couples.forEach(([a, b]) => {
      const childrenCount = randomInt(2, 3);
      for (let child = 0; child < childrenCount && people.length < TOTAL; child += 1) {
        const childId = addPerson(generation, branchId, [a, b], null);
        if (random() > 0.4 && people.length < TOTAL) {
          const partnerId = addPerson(generation, branchId, [], childId);
          nextCouples.push([childId, partnerId]);
        }
      }
    });
    if (nextCouples.length === 0) break;
    couples = nextCouples;
  }
}

// 300 публичных медиа + 20 семейных: смесь assetPath/внешних ссылок.
for (let m = 1; m <= 320; m += 1) {
  const isFamily = m > 300;
  const external = m % 3 === 0;
  media.push({
    mediaId: `m_${String(m).padStart(4, "0")}`,
    title: `Синтетический материал №${m}`,
    category: pick(["archive", "documents", "portraits"]),
    mediaType: "image",
    visibility: isFamily ? "FAMILY" : "PUBLIC",
    dateDisplay: String(1900 + randomInt(0, 120)),
    altText: `Синтетическая заглушка №${m}`,
    publicCaption: "",
    familyCaption: isFamily ? `СЕМЕЙНЫЕ ДАННЫЕ (CANARY m${m})` : "",
    sourceUrl: external ? `https://example.org/synthetic/${m}.jpg` : "",
    storage: external ? "EXTERNAL" : "PUBLIC_ASSET",
    assetPath: external ? "" : pick(["assets/archive-family.svg", "assets/archive-document.svg", "assets/portrait-man-1.svg"]),
    mimeType: external ? "image/jpeg" : "image/svg+xml",
    width: 600,
    height: 450,
    sortOrder: m
  });
}

// Связи человек→материалы (по 1–2 на человека).
people.forEach((person, index) => {
  const count = randomInt(0, 2);
  for (let k = 0; k < count; k += 1) {
    personMedia.push({
      personId: person.personId,
      mediaId: `m_${String(((index * 3 + k) % 300) + 1).padStart(4, "0")}`,
      role: "GALLERY"
    });
  }
});

// События: по одному на каждые 8 человек.
people.filter((_, index) => index % 8 === 0).forEach((person, index) => {
  events.push({
    eventId: `e_${String(index + 1).padStart(4, "0")}`,
    eventType: index % 5 === 0 ? "HISTORY" : "FAMILY",
    title: `Синтетическое событие ${index + 1}: ${person.displayName}`,
    displayDate: String(person.birthYear ?? 1900),
    startSortKey: (person.birthYear ?? 1900) * 10000,
    publicDescription: "Публичное описание синтетического события.",
    familyDescription: "",
    visibility: "PUBLIC",
    primaryPersonId: person.personId
  });
});

const payload = { people, details, events, media, personMedia, branches };
const target = join(HERE, "mock-api", "data.synthetic.json");
writeFileSync(target, `${JSON.stringify(payload, null, 1)}\n`, "utf8");
console.log(
  `OK: ${target} — ${people.length} людей, ${GENERATIONS} поколений, ${relationships.length} связей, ${events.length} событий, ${media.length} медиа.`
);
if (people.length < 200 || relationships.length < 250) {
  console.error("Пороги плана не достигнуты (200 людей / 250 связей) — увеличьте плотность генерации.");
  process.exit(1);
}
