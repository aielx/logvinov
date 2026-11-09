/**
 * Серверные константы и ключи Script Properties (схема v2 — «человеческая»).
 *
 * Три вкладки для редакторов: Люди / События / Материалы.
 * Никаких технических ID в таблице: люди связываются по ФИО,
 * идентификаторы для API назначаются сервером по номеру строки.
 */
export const API_VERSION = "1";
export const SCHEMA_VERSION = "2";
export const DEFAULT_DATA_REVISION = "1";

export const PROP = {
  PASSWORD_HASH: "FAMILY_PASSWORD_HASH",
  PASSWORD_SALT: "FAMILY_PASSWORD_SALT",
  AUTH_EPOCH: "AUTH_EPOCH",
  SPREADSHEET_ID: "SPREADSHEET_ID",
  DATA_REVISION: "DATA_REVISION",
  SESSION_PREFIX: "SESSION_"
} as const;

/** Итерации PBKDF2-HMAC-SHA256. Компромисс стойкость/время Apps Script (см. docs/threat-model.md). */
export const PASSWORD_ITERATIONS = 2000;
export const MIN_FAMILY_PASSWORD_LENGTH = 10;

/** Кэш ответов API в CacheService (публичные GET и приватные данные). */
export const PUBLIC_CACHE_TTL_SECONDS = 300;

/** Ячейка кэша с текущей ревизией: быстрый ключ для всех кэшей ответов. */
export const REVISION_CACHE_KEY = "settings:dataRevision";

/** Лимиты входа: глобальные (Apps Script не даёт надёжного IP клиента). */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const LOGIN_DELAY_MAX_MS = 2000;

/** Лимит запросов приватных медиа. */
export const MEDIA_RATE_LIMIT = 120;
export const MEDIA_RATE_WINDOW_SECONDS = 300;

/** Пагинация галереи. */
export const GALLERY_DEFAULT_LIMIT = 24;
export const GALLERY_MAX_LIMIT = 60;

/** Жёсткий предел приватного файла Drive до base64 (превышение — прикладная ошибка 400). */
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** Разрешённые MIME-типы медиа. */
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
export const ALLOWED_DOCUMENT_MIME = ["application/pdf"];
export const ALLOWED_MIME_TYPES = ALLOWED_IMAGE_MIME.concat(ALLOWED_DOCUMENT_MIME);

export const SHEETS = {
  INSTRUCTIONS: "Инструкция",
  PEOPLE: "Люди",
  EVENTS: "События",
  MATERIALS: "Материалы",
  REPORT: "Отчёт проверки"
} as const;

/**
 * Заголовки вкладок (v3): связи выбираются списком подстановки «№ · ФИО».
 * «Выбор» — служебная колонка листа «Люди» (формула склеивает № и ФИО,
 * скрипт создаёт и скрывает её); в CSV и при чтении строк она не участвует.
 */
export const HEADERS: Record<string, string[]> = {
  [SHEETS.PEOPLE]: [
    "№",
    "ФИО",
    "Дата рождения",
    "Дата смерти",
    "Живой",
    "Ветвь",
    "Отец",
    "Мать",
    "Супруг(а)",
    "Публичная биография",
    "Семейная биография",
    "Место рождения (публичное)",
    "Место рождения (семейное)",
    "Контакты (семейные)",
    "Заметки (семейные)",
    "Фото",
    "Видимость карточки",
    "Черновик",
    "Выбор"
  ],
  [SHEETS.EVENTS]: ["Дата", "Конец", "Отображать как", "Заголовок", "Описание", "Тип", "Видимость", "Человек", "Черновик"],
  [SHEETS.MATERIALS]: [
    "Название",
    "Подпись",
    "Дата",
    "Категория",
    "Видимость",
    "Ссылка",
    "Локальный путь",
    "Чей материал",
    "Роль",
    "Черновик"
  ]
};

/** Служебные колонки, не входящие в CSV и в чтение строк. */
export const SERVICE_COLUMNS: string[] = ["Выбор"];

/** Колонки с выбором человека: подстановка значений «№ · ФИО» из листа «Люди». */
export const PERSON_REF_COLUMNS: Record<string, string[]> = {
  [SHEETS.PEOPLE]: ["Отец", "Мать", "Супруг(а)"],
  [SHEETS.EVENTS]: ["Человек"],
  [SHEETS.MATERIALS]: ["Чей материал"]
};

/** Соответствие русских заголовков → полям записей (для чтения строк). */
export const FIELDS: Record<string, Record<string, string>> = {
  [SHEETS.PEOPLE]: {
    "№": "number",
    "ФИО": "fullName",
    "Дата рождения": "birthDate",
    "Дата смерти": "deathDate",
    "Живой": "isLiving",
    "Ветвь": "branch",
    "Отец": "father",
    "Мать": "mother",
    "Супруг(а)": "spouse",
    "Публичная биография": "publicBio",
    "Семейная биография": "familyBio",
    "Место рождения (публичное)": "publicBirthPlace",
    "Место рождения (семейное)": "familyBirthPlace",
    "Контакты (семейные)": "familyContacts",
    "Заметки (семейные)": "familyNotes",
    "Фото": "photo",
    "Видимость карточки": "cardVisibility",
    "Черновик": "draft"
  },
  [SHEETS.EVENTS]: {
    "Дата": "date",
    "Конец": "endDate",
    "Отображать как": "displayDate",
    "Заголовок": "title",
    "Описание": "description",
    "Тип": "type",
    "Видимость": "visibility",
    "Человек": "person",
    "Черновик": "draft"
  },
  [SHEETS.MATERIALS]: {
    "Название": "title",
    "Подпись": "caption",
    "Дата": "date",
    "Категория": "category",
    "Видимость": "visibility",
    "Ссылка": "sourceUrl",
    "Локальный путь": "assetPath",
    "Чей материал": "person",
    "Роль": "role",
    "Черновик": "draft"
  }
};

/** Обязательные заголовки: без них вкладка считается нерабочей (общая ошибка схемы). */
export const REQUIRED_HEADERS: Record<string, string[]> = {
  [SHEETS.PEOPLE]: ["№", "ФИО"],
  [SHEETS.EVENTS]: ["Дата", "Заголовок"],
  [SHEETS.MATERIALS]: ["Название"]
};

/** Колонки-чекбоксы (галочки): «Живой» и «Черновик» вводятся одним кликом. */
export const CHECKBOX_COLUMNS: Record<string, string[]> = {
  [SHEETS.PEOPLE]: ["Живой", "Черновик"],
  [SHEETS.EVENTS]: ["Черновик"],
  [SHEETS.MATERIALS]: ["Черновик"]
};

/** Выпадающие списки (режим предупреждения). */
export const LIST_VALIDATIONS: Record<string, Record<string, string[]>> = {
  [SHEETS.PEOPLE]: {
    "Видимость карточки": ["", "Семейная", "Публичная"]
  },
  [SHEETS.EVENTS]: {
    "Тип": ["Семейное", "Историческое"],
    "Видимость": ["Публичное", "Семейное"]
  },
  [SHEETS.MATERIALS]: {
    "Категория": ["Фотоархив", "Документы", "Портреты"],
    "Видимость": ["Публичное", "Семейное"],
    "Роль": ["Портрет", "Галерея", "Документ"]
  }
};

export const AVATAR_ASSET_PLACEHOLDER = "assets/portrait-neutral.svg";
