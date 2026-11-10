# Род Логвиновых — семейный архив

Семейный генеалогический архив: интерактивное древо, хронология и галерея. Сайт — статическая сборка [Astro](https://astro.build), публикуемая на GitHub Pages (`https://logvinov-tree.ru/`); данные — закрытая Google Sheet + проектная папка Google Drive через Apps Script Web App. Подробности — `plans/astro-family-archive-plan.md`.

## Быстрый старт

```bash
npm ci
npm run gen:mock   # демо-данные для локального mock-API
npm run dev        # разработка (URL API — в .env, см. .env.example)
npm run test       # server + unit + build + privacy scan + e2e
```

## Структура

```
src/                 Astro-сайт (страницы, компоненты, lib, стили)
apps-script/         Код Apps Script API (Code/Api/Auth/Sessions/… + тесты)
tests/               unit (front/server), e2e (Playwright), fixtures (mock-API)
scripts/             check-dist-privacy, генерация демо-данных mock-API
prototype/           api-smoke.html — ручная проверка контракта Apps Script
family-archive-mock/ исходный статический макет (эталон, не публикуется)
docs/                политика данных, руководства, развёртывание, runbook
plans/               план миграции (не публикуется)
```

## Документация

- `docs/deployment.md` — полное развёртывание (Google Sheet → Apps Script → GitHub Pages), включая ручные шаги владельца.
- `docs/data-policy.md` — что публично, что после входа, что никогда не покидает сервер.
- `docs/threat-model.md` — угрозы, принятые риски, ограничения платформы.
- `docs/sheets-guide.md`, `docs/drive-guide.md` — инструкции редакторов архива.
- `sheet-import/` — готовые CSV демо-данных (3 листа) для импорта в Google Sheet: `npm run gen:csv`.
- `docs/admin-guide.md`, `docs/runbook.md`, `docs/backup-restore.md` — эксплуатация.

## Основные npm-скрипты

| Скрипт | Назначение |
|---|---|
| `npm run dev` / `build` / `preview` | Astro |
| `npm run test` | полный прогон: серверные + клиентские тесты, build, privacy scan, e2e |
| `npm run test:server` | логика Apps Script (vitest + подмены сервисов) |
| `npm run test:e2e` | Playwright против локального contract-mock API (Chromium/Firefox/WebKit/touch) |
| `npm run test:a11y` | axe-аудит страниц |
| `npm run test:dist-privacy` | скан dist на приватные строки |
| `npm run test:e2e:staging` | проверка живого Apps Script (нужны API_STAGING_URL и E2E_FAMILY_PASSWORD) |
| `npm run gen:mock` | пересоздать data.json mock-API из демо-набора |

Разработчик: Александр Сергеевич Логвинов · logvinovaleksander@gmail.com
