import { createHash, randomBytes } from "node:crypto";

/** Every personal API key starts with this, so it is easy to spot in logs and secret scanners. */
export const API_KEY_PREFIX = "khata_";

/** How much of the key is kept in the clear for display: the prefix plus six characters. */
const DISPLAY_LENGTH = API_KEY_PREFIX.length + 6;

/** `khata_` plus 32 random bytes in base64url (43 characters). */
export function generateApiKey() {
  const token = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, DISPLAY_LENGTH), hash: hashApiKey(token) };
}

export function hashApiKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isApiKey(value: string) {
  return /^khata_[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * The key from `Authorization: Bearer khata_...` or `X-API-Key: khata_...`. Returns null
 * when neither header carries something shaped like a Khata key, so a Better Auth
 * session bearer token still falls through to the session check.
 */
export function readApiKey(headers: Headers) {
  const header = headers.get("x-api-key")?.trim();
  if (header) return header;
  const authorization = headers.get("authorization")?.trim() ?? "";
  const match = /^bearer\s+(\S+)$/i.exec(authorization);
  if (match && match[1]!.startsWith(API_KEY_PREFIX)) return match[1]!;
  return null;
}
