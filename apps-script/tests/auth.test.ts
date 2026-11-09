import { describe, expect, it } from "vitest";
import { pbkdf2Sha256, setFamilyPassword, verifyFamilyPassword, revokeAllSessionsByEpoch, currentAuthEpoch } from "../src/Auth";
import { createSession, isSessionValid } from "../src/Sessions";
import { resetMockState } from "./globals-mock";

describe("PBKDF2-HMAC-SHA256 (векторы RFC 7914)", () => {
  const saltHex = Buffer.from("salt", "utf-8").toString("hex");

  it("c=1", () => {
    expect(pbkdf2Sha256("password", saltHex, 1)).toBe("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b");
  });

  it("c=2", () => {
    expect(pbkdf2Sha256("password", saltHex, 2)).toBe("ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43");
  });

  it("c=4096", () => {
    expect(pbkdf2Sha256("password", saltHex, 4096)).toBe("c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a");
  });
});

describe("Семейный пароль", () => {
  it("устанавливается и проверяется; неверный не проходит", () => {
    resetMockState();
    setFamilyPassword("правильный-длинный-пароль");
    expect(verifyFamilyPassword("правильный-длинный-пароль")).toBe(true);
    expect(verifyFamilyPassword("неверный-пароль")).toBe(false);
    expect(verifyFamilyPassword("")).toBe(false);
  });

  it("короткий пароль отклоняется", () => {
    resetMockState();
    expect(() => setFamilyPassword("short")).toThrow(/не короче/);
  });

  it("смена пароля отзывает сессии ростом AUTH_EPOCH", () => {
    resetMockState();
    setFamilyPassword("первый-длинный-пароль");
    const before = currentAuthEpoch();
    const session = createSession();
    expect(session.token.length).toBeGreaterThanOrEqual(64);
    setFamilyPassword("второй-длинный-пароль");
    expect(currentAuthEpoch()).toBeGreaterThan(before);
    // Токен прежней эпохи недействителен.
    expect(isSessionValid(session.token)).toBe(false);
  });

  it("глобальный отзыв без смены пароля удаляет записи сессий", () => {
    resetMockState();
    setFamilyPassword("пароль-для-отзыва-сессий");
    createSession();
    createSession();
    const removed = revokeAllSessionsByEpoch();
    expect(removed).toBe(2);
  });
});
