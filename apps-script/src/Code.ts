/**
 * Точка входа Apps Script: Web App (doGet/doPost), меню таблицы и закрытые admin-функции.
 *
 * Развёртывание (владелец, вручную):
 *  1. Открыть редактор Apps Script этой таблицы → Развернуть → Новое развёртывание.
 *  2. Тип «Веб-приложение»: выполнять от имени владельца, доступ «Все».
 *  3. Скопировать /exec URL в PUBLIC_APPS_SCRIPT_URL сайта.
 * Подробно: docs/deployment.md
 */
import { handleGet, handlePost } from "./Api";
import { HttpEvent } from "./Types";
import { applyPersonRefValidations, bumpDataRevision, ensureStructure, fillMissingPersonNumbers, getSpreadsheet, readRawRecords, writeValidationReport } from "./SheetsRepository";
import { seedDemoData } from "./Seed";
import { validateArchive } from "./Validation";
import { setFamilyPassword, revokeAllSessionsByEpoch } from "./Auth";
import { countSessions } from "./Sessions";
import { MIN_FAMILY_PASSWORD_LENGTH, PROP } from "./Config";

function doGet(e: HttpEvent): GoogleAppsScript.Content.TextOutput {
  return handleGet(e ?? { parameter: {} });
}

function doPost(e: HttpEvent): GoogleAppsScript.Content.TextOutput {
  return handlePost(e ?? { parameter: {} });
}

// ---------------------------------------------------------------------------
// Меню таблицы
// ---------------------------------------------------------------------------

function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu("Семейный архив")
    .addItem("Проставить номера людям", "menuFillNumbers")
    .addItem("Проверить данные", "menuValidateData")
    .addItem("Обновить публичный кэш", "menuRefreshCache")
    .addItem("Обновить списки подстановки", "menuRefreshDropdowns")
    .addSeparator()
    .addItem("Активные сессии (число)", "menuSessionCount")
    .addToUi();
}

function menuFillNumbers(): void {
  const filled = fillMissingPersonNumbers();
  SpreadsheetApp.getUi().alert(`Проставлено номеров: ${filled}.`);
}

function menuRefreshDropdowns(): void {
  applyPersonRefValidations();
  SpreadsheetApp.getUi().alert("Списки подстановки (№ людей) обновлены.");
}

function menuValidateData(): void {
  const raw = readRawRecords();
  const archive = validateArchive(raw);
  writeValidationReport(archive.issues);
  SpreadsheetApp.getUi().alert(
    archive.issues.length === 0
      ? "Ошибок не найдено: данные готовы к публикации."
      : `Найдено проблем: ${archive.issues.length}. Отчёт — на вкладке «Отчёт проверки».`
  );
}

function menuRefreshCache(): void {
  const revision = bumpDataRevision();
  SpreadsheetApp.getUi().alert(`Публичный кэш обновлён (dataRevision=${revision}). Изменения появятся на сайте сразу.`);
}

function menuSessionCount(): void {
  SpreadsheetApp.getUi().alert(`Активных семейных сессий: ${countSessions()}.`);
}

// ---------------------------------------------------------------------------
// Закрытые admin-функции (запускать из редактора Apps Script владельцем)
// ---------------------------------------------------------------------------

/** Полная инициализация структуры + демо-данных. Безопасна при повторном запуске. */
function setup(): void {
  ensureStructure();
  seedDemoData();
  const spreadsheet = getSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP.SPREADSHEET_ID)) {
    props.setProperty(PROP.SPREADSHEET_ID, spreadsheet.getId());
  }
  console.info("setup: готово (листы, списки, формулы, свойства). Пароль задаётся функцией setupFamilyPassword.");
}

/**
 * Задать/сменить семейный пароль. Все прежние сессии отзываются ростом AUTH_EPOCH.
 * Пароль передаётся аргументом; интерактивных диалогов нет.
 */
function setFamilyPasswordAndRevoke(password?: string): void {
  const pass = password ?? "";
  if (pass.length < MIN_FAMILY_PASSWORD_LENGTH) {
    throw new Error(`Пароль не задан или короче ${MIN_FAMILY_PASSWORD_LENGTH} символов. Используйте функцию setupFamilyPassword().`);
  }
  setFamilyPassword(pass);
}

/**
 * Одноразовая установка пароля: впишите пароль в кавычках и запустите ЭТУ функцию.
 * ВАЖНО: реальный пароль живёт только в вашем редакторе Apps Script — не добавляйте
 * его в файлы репозитория (репозиторий публичный). После запуска строку можно очистить:
 * в Script Properties останется только хеш.
 */
function setupFamilyPassword(): void {
  setFamilyPasswordAndRevoke("ВПИШИТЕ_ПАРОЛЬ_ЗДЕСЬ");
}

/** Отозвать все семейные сессии без смены пароля. */
function revokeAllSessions(): void {
  const removed = revokeAllSessionsByEpoch();
  console.info(`Revoked sessions: ${removed}`);
}
