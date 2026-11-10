# Развёртывание: Google Sheet + Apps Script + GitHub Pages

Полная цепочка публикации семейного архива. Часть шагов выполняется вручную владельцем аккаунта Google (это нельзя автоматизировать из репозитория) — они помечены **[ручной шаг]**.

## Обзор

```
Google Sheet (закрытая)  ←→  Apps Script Web App (/exec)  ←→  Сайт на GitHub Pages
Google Drive (проектная папка) ↗ (только приватные медиа)
```

- Сайт: `https://logvinov-tree.ru/` — статическая сборка Astro, публикуется GitHub Actions из `dist` (кастомный домен GitHub Pages).
- API: Apps Script Web App из `apps-script/`, выполняется от имени владельца, доступ «Все» (анонимно), каждая приватная операция проверяет серверную сессию.
- Семейный пароль, хеши сессий и настройки — в Script Properties проекта Apps Script.

## Шаг 1. [ручной] Создание Google Sheet и Apps Script

1. Создайте новую закрытую Google Sheet (например, «Семейный архив Логвиновых»).
2. Меню **Расширения → Apps Script** — откроется контейнерный проект, привязанный к таблице (рекомендуемый вариант).
3. Загрузите код — два равнозначных варианта:

   **Вариант А — без clasp (рекомендуется для старта):**
   ```bash
   npm run gen:gs   # соберёт чистый JS в sheet-import/apps-script-js/*.gs
   ```
   Откройте в таблице «Расширения → Apps Script» и вставьте файлы по инструкции
   `sheet-import/apps-script-js/README-GS.md` (15 файлов + appsscript.json).
   TypeScript в веб-редактор вставлять нельзя — используйте именно сгенерированные .gs.

   **Вариант Б — clasp (для дальнейшей разработки):**
   ```bash
   npm install -g @google/clasp
   clasp login
   mkdir clasp-work && cd clasp-work
   clasp clone <SCRIPT_ID>   # Script ID: Настройки проекта → «Идентификаторы»
   # скопируйте apps-script/src/*.ts и appsscript.json поверх, затем:
   clasp push                # TS транспилируется автоматически
   ```
4. Обновите файл `appsscript.json` в проекте из репозитория (в редакторе: Настройки → «Показывать манифест…»).

## Шаг 2. [ручной] Инициализация данных

В редакторе Apps Script:

1. Выберите функцию `setup` и нажмите **Выполнить** — создадутся листы «Люди/События/Материалы», чекбоксы, выпадающие списки подстановки (Отец/Мать/Супруг(а)/Человек/Чей материал — выбор № из листа «Люди»), авто-колонки «(кто)», демо-данные и лист «Инструкция». Если данные импортированы из CSV (`sheet-import/`), setup их не тронет — только добавит оформление.
2. Разрешите запрошенные доступы (Sheets, Drive, интерфейс таблицы).
3. Задайте семейный пароль (не короче 10 символов, длинную фразу удобнее, чем сложную):
   ```js
   // в редакторе, функция внизу файла Code.ts запускается с аргументом пароля
   setFamilyPasswordAndRevoke("длинная-семейная-фраза-пароль")
   ```
   При смене пароля все сессии отзываются автоматически (рост `AUTH_EPOCH`).

## Шаг 3. [ручной] Развёртывание Web App

1. **Развернуть → Новое развёртывание**, тип **Веб-приложение**.
2. Описание: версия и дата; **Выполнять как: меня**; **Доступ: все** (это доступ к API, а не к таблице).
3. Скопируйте URL вида `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`.
4. Обновления кода: сначала **Развернуть → Управление развёртываниями → Изменить → Новая версия**, затем тот же deployment (версионированный `/dev` — только для разработки).

## Шаг 4. Проверка контракта до публикации сайта

Откройте `prototype/api-smoke.html` локально (или с любого origin), вставьте `/exec` URL и пароль, прогоните все действия:
- JSON читается без `no-cors`, ошибок CORS нет;
- неверный пароль → прикладная 401;
- приватный запрос без токена → 401;
- семейной сессии хватает на `private.person` и `private.media`.

Staging-прогон из CI-подобной среды:
```bash
API_STAGING_URL=https://script.google.com/macros/s/<ID>/exec \
E2E_FAMILY_PASSWORD='...' \
npm run test:e2e:staging
```

## Шаг 5. [ручной] Настройка репозитория GitHub

Репозиторий `aielx/logvinov`:

1. **Settings → Pages → Source: GitHub Actions**.
2. **Кастомный домен**: в Settings → Pages → Custom domain указать `logvinov-tree.ru`. Домен берётся из файла `public/CNAME`, попадающего в `dist` при сборке. У регистратора домена нужны DNS-записи:
   - apex `logvinov-tree.ru` → A-записи `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`;
   - `www.logvinov-tree.ru` → CNAME на `aielx.github.io.`
   После проверки DNS включить **Enforce HTTPS** (сертификат Let's Encrypt выпускается автоматически).
3. **Settings → Secrets and variables → Actions → Variables** (не Secrets!): `PUBLIC_APPS_SCRIPT_URL = https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`.
4. Семейный пароль в CI не добавляется. Для авторизованных staging-проверок секрет `E2E_FAMILY_PASSWORD` задаётся только для окружения ручного запуска и не доступен из fork-PR.
5. Push в `main` → workflow `.github/workflows/pages.yml`: тесты → build → privacy scan → публикация `dist`.

## Шаг 6. Приёмка на production

После первого деплоя проверьте по чек-листу `plans/astro-family-archive-plan.md` (раздел 11):
- `https://logvinov-tree.ru/` открывается (и `https://www.logvinov-tree.ru/` редиректит на него); прямые переходы `/tree/`, `/timeline/`, `/gallery/` не дают 404;
- D3 загружается из сборки (без CDN);
- вход/выход работают с реального origin GitHub Pages;
- правка Sheet видна на сайте в течение 5 минут (или сразу после «Обновить публичный кэш»).

## Версионирование и откат

- Apps Script: откат = назначить предыдущую версию существующему развёртыванию; после отката очистите публичный кэш через меню таблицы.
- Сайт: повторная публикация предыдущего зелёного commit в `main` (или `git revert` + push).
- См. также `docs/runbook.md` и `docs/backup-restore.md`.

## Локальная разработка

```bash
npm ci
npm run gen:mock        # data.json для локального mock-API (из демо-набора)
npm run dev             # astro dev; PUBLIC_APPS_SCRIPT_URL можно указать в .env
npm run test            # server + unit + build + privacy + e2e (mock-API)
```

`.env` (см. `.env.example`): `PUBLIC_APPS_SCRIPT_URL=…/exec` — публичный адрес, не секрет.
