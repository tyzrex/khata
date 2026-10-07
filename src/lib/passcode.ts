export const SESSION_COOKIE = "khata_session";
const SESSION_PAYLOAD = "khata-ledger-v1";

export function passcodeConfigured() {
  return Boolean(process.env.APP_PASSCODE);
}

export function safeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

export async function sessionToken(passcode: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SESSION_PAYLOAD));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function expectedSessionToken() {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return null;
  return sessionToken(passcode);
}

export function bearerMatches(request: Request) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return true;
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return safeEqual(header.slice(7).trim(), passcode);
  }
  const alternate = request.headers.get("x-khata-passcode");
  if (alternate) return safeEqual(alternate.trim(), passcode);
  return false;
}
