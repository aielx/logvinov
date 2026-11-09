function isBlank(value) {
  return value === null || value === void 0 || String(value).trim() === "";
}
function toText(value) {
  if (value === null || value === void 0) return "";
  return String(value).trim();
}
function toInt(value, fallback) {
  const text = toText(value);
  if (text === "") return fallback;
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function toBool(value) {
  if (typeof value === "boolean") return value;
  const text = toText(value).toUpperCase();
  if (["TRUE", "\u0414\u0410", "YES", "1", "+"].includes(text)) return true;
  if (["FALSE", "\u041D\u0415\u0422", "NO", "0", "-", ""].includes(text)) return false;
  return null;
}
function parseFlexibleDate(raw) {
  const text = toText(raw);
  if (text === "") {
    return { year: null, month: null, day: null, precision: "YEAR", sortKey: 0 };
  }
  const match = /^(\d{3,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  if (year < 1e3 || year > 2200) return null;
  let month = null;
  let day = null;
  let precision = "YEAR";
  if (match[2] !== void 0) {
    month = parseInt(match[2], 10);
    if (month < 1 || month > 12) return null;
    precision = "MONTH";
    if (match[3] !== void 0) {
      day = parseInt(match[3], 10);
      if (day < 1 || day > 31) return null;
      precision = "DAY";
    }
  }
  return { year, month, day, precision, sortKey: year * 1e4 + (month ?? 0) * 100 + (day ?? 0) };
}
function formatYears(birthYear, deathYear, isLiving) {
  if (birthYear === null) return "\u0433\u043E\u0434\u044B \u043D\u0435 \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u044B";
  if (isLiving) return `${birthYear}\u2013\u043D. \u0432.`;
  return deathYear === null ? String(birthYear) : `${birthYear}\u2013${deathYear}`;
}
function sha256Hex(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytesToHex(bytes);
}
function bytesToHex(bytes) {
  return bytes.map((b) => ((b < 0 ? b + 256 : b) & 255).toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const clean = hex.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  if (clean.length === 0 || clean.length % 2 !== 0) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 hex");
  const out = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}
function hmacSha256Bytes(value, key) {
  const toSigned = (input) => (typeof input === "string" ? Array.from(Utilities.newBlob(input).getBytes()) : input).map(
    (b) => b > 127 ? b - 256 : b < 0 ? b + 256 : b
  );
  const raw = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_256,
    toSigned(value),
    toSigned(key)
  );
  return raw.map((b) => b < 0 ? b + 256 : b);
}
function randomToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
}
function randomRequestId() {
  return Utilities.getUuid();
}
function nowIso() {
  return Utilities.formatDate(/* @__PURE__ */ new Date(), "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'");
}
function constantTimeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
function extractDriveFileId(rawUrl) {
  const url = toText(rawUrl);
  if (url === "") return null;
  const patterns = [/\/file\/d\/([A-Za-z0-9_-]{10,})/, /[?&]id=([A-Za-z0-9_-]{10,})/];
  for (const pattern of patterns) {
    const match = pattern.exec(url);
    if (match) return match[1];
  }
  return null;
}
function isDriveUrl(rawUrl) {
  const url = toText(rawUrl);
  return /^https:\/\/(drive|docs)\.google\.com\//.test(url);
}
function driveImageUrl(fileId, maxWidth) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${maxWidth}`;
}
function isSafeExternalUrl(rawUrl) {
  const url = toText(rawUrl);
  return /^https:\/\/[^\s"'<>()]+$/i.test(url);
}
function isSafeAssetPath(rawPath) {
  const path = toText(rawPath);
  if (path === "") return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(path)) return false;
  if (path.includes("..")) return false;
  return /^(assets|media\/public)\//.test(path);
}
function encodeCursor(payload) {
  const json = JSON.stringify(payload);
  return Utilities.base64Encode(json, Utilities.Charset.UTF_8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeCursor(cursor) {
  const cleaned = toText(cursor).replace(/-/g, "+").replace(/_/g, "/");
  if (cleaned === "") return null;
  try {
    const json = Utilities.newBlob(Utilities.base64Decode(cleaned)).getDataAsString();
    return JSON.parse(json);
  } catch {
    return null;
  }
}

