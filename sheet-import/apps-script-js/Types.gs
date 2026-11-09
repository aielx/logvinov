/**
 * Этот файл — для копирования в веб-редактор Google Apps Script.
 * НЕ копируйте apps-script/src/*.ts: это TypeScript с import-инструкциями.
 * Сгенерировано автоматически: npm run gen:gs.
 */
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class ApiFailure {
  constructor(status, code, message, retryable = false, retryAfterSeconds) {
    __publicField(this, "status");
    __publicField(this, "code");
    __publicField(this, "message");
    __publicField(this, "retryable");
    __publicField(this, "retryAfterSeconds");
    this.status = status;
    this.code = code;
    this.message = message;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

