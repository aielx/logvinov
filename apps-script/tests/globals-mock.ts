/**
 * Подмены глобальных сервисов Apps Script для серверных тестов в Node (vitest).
 * Устанавливаются на globalThis; состояние сбрасывается resetMockState().
 */
import { createHash, createHmac, randomUUID } from "node:crypto";

export interface MockDriveFile {
  id: string;
  name: string;
  mimeType: string;
  bytes: number[];
}

interface MockState {
  properties: Map<string, string>;
  cache: Map<string, { value: string; expiresAt: number }>;
  driveFiles: Map<string, MockDriveFile>;
  sheets: Record<string, unknown[][]>;
  outputs: Array<{ text: string; mimeType: string }>;
}

const state: MockState = {
  properties: new Map(),
  cache: new Map(),
  driveFiles: new Map(),
  sheets: {},
  outputs: []
};

export function resetMockState(): void {
  state.properties.clear();
  state.cache.clear();
  state.driveFiles.clear();
  state.sheets = {};
  state.outputs = [];
}

export function setMockSheets(sheets: Record<string, unknown[][]>): void {
  state.sheets = sheets;
}

export function addMockDriveFile(file: MockDriveFile): void {
  state.driveFiles.set(file.id, file);
}

export function getMockProperties(): Map<string, string> {
  return state.properties;
}

function toSignedBytes(buf: Buffer): number[] {
  return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
}

const UtilitiesMock = {
  DigestAlgorithm: { SHA_256: "SHA_256" },
  MacAlgorithm: { HMAC_SHA_256: "HMAC_SHA_256" },
  Charset: { UTF_8: "UTF_8" },
  computeDigest(algorithm: string, value: string | number[], charset?: string): number[] {
    const input = typeof value === "string" ? Buffer.from(value, "utf-8") : Buffer.from(value.map((b) => (b < 0 ? b + 256 : b)));
    return toSignedBytes(createHash("sha256").update(input).digest());
  },
  computeHmacSignature(algorithm: string, value: string | number[], key: string | number[]): number[] {
    const valueBuf = typeof value === "string" ? Buffer.from(value, "utf-8") : Buffer.from(value.map((b) => (b < 0 ? b + 256 : b)));
    const keyBuf = typeof key === "string" ? Buffer.from(key, "utf-8") : Buffer.from(key.map((b) => (b < 0 ? b + 256 : b)));
    return toSignedBytes(createHmac("sha256", keyBuf).update(valueBuf).digest());
  },
  getUuid(): string {
    return randomUUID();
  },
  base64Encode(value: string | number[]): string {
    const buf = typeof value === "string" ? Buffer.from(value, "utf-8") : Buffer.from(value.map((b) => (b < 0 ? b + 256 : b)));
    return buf.toString("base64");
  },
  base64Decode(value: string): number[] {
    return toSignedBytes(Buffer.from(value, "base64"));
  },
  newBlob(data: string | number[] | null): { getBytes: () => number[]; getDataAsString: () => string; getContentType: () => string } {
    return {
      getBytes: () => (typeof data === "string" ? toSignedBytes(Buffer.from(data, "utf-8")) : data ?? []),
      getDataAsString: () => (typeof data === "string" ? data : Buffer.from(data ?? []).toString("utf-8")),
      getContentType: () => "application/octet-stream"
    };
  },
  formatDate(date: Date, _timeZone: string, format: string): string {
    const iso = date.toISOString();
    return format.replace("yyyy-MM-dd'T'HH:mm:ss'Z'", iso.replace(/\.\d{3}Z$/, "Z"));
  },
  sleep(_ms: number): void {
    /* noop в тестах */
  }
};

const scriptProperties = {
  getProperty(key: string): string | null {
    return state.properties.get(key) ?? null;
  },
  setProperty(key: string, value: string): void {
    state.properties.set(key, value);
  },
  deleteProperty(key: string): void {
    state.properties.delete(key);
  },
  getKeys(): string[] {
    return Array.from(state.properties.keys());
  }
};

const scriptCache = {
  get(key: string): string | null {
    const entry = state.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      state.cache.delete(key);
      return null;
    }
    return entry.value;
  },
  put(key: string, value: string, expirationInSeconds: number): void {
    state.cache.set(key, { value, expiresAt: Date.now() + expirationInSeconds * 1000 });
  },
  remove(key: string): void {
    state.cache.delete(key);
  },
  removeAll(keys: string[]): void {
    keys.forEach((key) => state.cache.delete(key));
  }
};

const scriptLock = {
  tryLock(_ms: number): boolean {
    return true;
  },
  releaseLock(): void {
    /* noop */
  },
  hasLock(): boolean {
    return true;
  }
};

function makeSheet(name: string, values: unknown[][]): unknown {
  const formulas = new Map<string, string>();
  const lastColumn = () => values.reduce((max, row) => Math.max(max, row.length), 1);
  const ensure = (row: number, col: number): void => {
    while (values.length < row) values.push([]);
    const target = values[row - 1] as unknown[];
    while (target.length < col) target.push("");
  };
  const makeRange = (row: number, col: number, numRows: number, numCols: number) => ({
    getRow: () => row,
    getColumn: () => col,
    getNumRows: () => numRows,
    getNumColumns: () => numCols,
    getValues: () => {
      const out: unknown[][] = [];
      for (let r = 0; r < numRows; r += 1) {
        const line = values[row - 1 + r] ?? [];
        out.push(Array.from({ length: numCols }, (_, c) => line[col - 1 + c] ?? ""));
      }
      return out;
    },
    getValue: () => (values[row - 1] ?? [])[col - 1] ?? "",
    setValue: (v: unknown) => {
      ensure(row, col);
      (values[row - 1] as unknown[])[col - 1] = v;
      return makeRange(row, col, numRows, numCols);
    },
    setValues: (vs: unknown[][]) => {
      vs.forEach((line, r) =>
        line.forEach((v, c) => {
          ensure(row + r, col + c);
          (values[row - 1 + r] as unknown[])[col - 1 + c] = v;
        })
      );
      return makeRange(row, col, numRows, numCols);
    },
    getFormula: () => formulas.get(`${row}:${col}`) ?? "",
    setFormula: (f: string) => {
      formulas.set(`${row}:${col}`, f);
      return makeRange(row, col, numRows, numCols);
    },
    clearContent: () => {
      formulas.delete(`${row}:${col}`);
      for (let r = 0; r < numRows; r += 1) {
        const line = values[row - 1 + r];
        if (!line) continue;
        for (let c = 0; c < numCols; c += 1) if (col - 1 + c < line.length) line[col - 1 + c] = "";
      }
      return makeRange(row, col, numRows, numCols);
    }
  });
  return {
    getName: () => name,
    getDataRange: () => ({ getValues: () => values }),
    getLastRow: () => {
      let last = 0;
      values.forEach((row, index) => {
        if (row.some((cell) => cell !== "" && cell !== undefined && cell !== null)) last = index + 1;
      });
      return last;
    },
    getLastColumn: () => lastColumn(),
    getMaxRows: () => Math.max(values.length, 100),
    getRange: (row: number, col: number, numRows = 1, numCols = 1) => makeRange(row, col, numRows, numCols)
  };
}

export const SpreadsheetAppMock = {
  getActive(): unknown {
    return {
      getId: () => "mock-spreadsheet-id",
      getSheetByName(name: string): unknown | null {
        const values = state.sheets[name];
        return values ? makeSheet(name, values) : null;
      }
    };
  }
};

export const DriveAppMock = {
  getFileById(id: string): unknown {
    const file = state.driveFiles.get(id);
    if (!file) throw new Error(`File not found: ${id}`);
    return {
      getName: () => file.name,
      getBlob: () => ({
        getBytes: () => file.bytes.map((b) => (b > 127 ? b - 256 : b)),
        getContentType: () => file.mimeType
      })
    };
  }
};

const ContentServiceMock = {
  MimeType: { JSON: "JSON", TEXT: "TEXT" },
  createTextOutput(text: string): unknown {
    const output = { text, mimeType: "TEXT", setMimeType(m: string) { this.mimeType = m; state.outputs.push({ text, mimeType: m }); return output; } };
    return output;
  }
};

export function installAppsScriptGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  g.Utilities = UtilitiesMock;
  g.PropertiesService = { getScriptProperties: () => scriptProperties };
  g.CacheService = { getScriptCache: () => scriptCache };
  g.LockService = { getScriptLock: () => scriptLock };
  g.SpreadsheetApp = SpreadsheetAppMock;
  g.DriveApp = DriveAppMock;
  g.ContentService = ContentServiceMock;
  g.console = console;
}

installAppsScriptGlobals();
