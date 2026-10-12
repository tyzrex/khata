import { createHash } from "node:crypto";
import { claimIdempotencyKey, completeIdempotencyKey, releaseIdempotencyKey } from "@/db/idempotency";
import { ConflictError, RequestError } from "@/server/errors";

/**
 * Run a write at most once per caller-chosen key.
 *
 * Retrying is what makes an unreliable network usable — a bot resends after a
 * timeout, a person double-clicks Save — and for a write that moves money, the
 * retry that works is the one that adds a second expense. The caller attaches a key
 * (`Idempotency-Key` header or an `externalId`); the first request with it runs and
 * its answer is stored, and every later request with the same key gets that answer
 * back without running again. Without a key nothing changes.
 *
 * Reusing a key for a *different* request is refused instead of answered, because
 * returning the old result would tell the caller their new expense was saved.
 */

const MAX_KEY_LENGTH = 200;
/** How long a second request waits for the first to finish before reporting a conflict. */
const WAIT_MS = 8_000;
const POLL_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function fingerprintOf(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value) ?? "").digest("hex");
}

/**
 * What makes two requests "the same" for a key. The date is left out: "today" and
 * "yesterday" mean something different once midnight passes between a request and its
 * retry, and a retry across midnight is still the same expense.
 */
export function withoutDate<T extends { date?: unknown }>(body: T) {
  const { date, ...rest } = body;
  void date;
  return rest;
}

/** The header wins over a body `externalId`; blank means "no key". */
export function idempotencyKeyOf(request: Request, fallback?: string | null) {
  const key = (request.headers.get("idempotency-key") ?? fallback ?? "").trim();
  if (key.length > MAX_KEY_LENGTH) throw new RequestError(`Idempotency key must be at most ${MAX_KEY_LENGTH} characters.`, 400);
  return key || null;
}

export async function once<T>(userId: string, scope: string, key: string | null, request: unknown, run: () => Promise<T>): Promise<{ result: T; replayed: boolean }> {
  if (!key) return { result: await run(), replayed: false };
  if (key.length > MAX_KEY_LENGTH) throw new RequestError(`Idempotency key must be at most ${MAX_KEY_LENGTH} characters.`, 400);

  const stored = `${scope}:${key}`;
  const fingerprint = fingerprintOf(request);
  const deadline = Date.now() + WAIT_MS;

  for (;;) {
    const claim = await claimIdempotencyKey(userId, stored, fingerprint);
    if (claim.claimed) break;
    if (claim.fingerprint !== fingerprint) {
      throw new ConflictError("That Idempotency-Key was already used for a different request. Use a new key for a new request.");
    }
    if (claim.response !== null) return { result: claim.response as T, replayed: true };
    if (Date.now() >= deadline) throw new ConflictError("The first request with this Idempotency-Key is still running. Retry in a few seconds.");
    await sleep(POLL_MS);
  }

  let result: T;
  try {
    result = await run();
  } catch (error) {
    await releaseIdempotencyKey(userId, stored).catch(() => undefined);
    throw error;
  }
  // The write landed. Failing to remember the answer must not turn it into a failure the
  // caller will retry; the claim simply stays until it is considered abandoned.
  await completeIdempotencyKey(userId, stored, result).catch((error) => console.error("Could not store idempotent response", error));
  return { result, replayed: false };
}
