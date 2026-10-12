import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { idempotencyKeys } from "@/db/schema";

/** A claim with no answer after this long belongs to a request that died; its key may be claimed again. */
const ABANDONED_AFTER_MS = 2 * 60_000;

export type Claim = { claimed: true } | { claimed: false; fingerprint: string; response: unknown | null };

/** Try to be the one request that runs for this key. */
export async function claimIdempotencyKey(userId: string, key: string, fingerprint: string): Promise<Claim> {
  const db = getDb();
  const inserted = await db.insert(idempotencyKeys).values({ userId, key, fingerprint }).onConflictDoNothing().returning({ key: idempotencyKeys.key });
  if (inserted.length) return { claimed: true };

  // Someone holds it. If that request never finished, take it over atomically.
  const stale = new Date(Date.now() - ABANDONED_AFTER_MS);
  const taken = await db
    .update(idempotencyKeys)
    .set({ fingerprint, createdAt: new Date() })
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key), isNull(idempotencyKeys.response), lt(idempotencyKeys.createdAt, stale)))
    .returning({ key: idempotencyKeys.key });
  if (taken.length) return { claimed: true };

  const [row] = await db
    .select({ fingerprint: idempotencyKeys.fingerprint, response: idempotencyKeys.response })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)))
    .limit(1);
  // The row vanished between the two statements (released by its owner): claim again.
  if (!row) return claimIdempotencyKey(userId, key, fingerprint);
  return { claimed: false, fingerprint: row.fingerprint, response: row.response };
}

export async function completeIdempotencyKey(userId: string, key: string, response: unknown) {
  await getDb()
    .update(idempotencyKeys)
    .set({ response: response ?? null })
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
}

/** The first request failed, so nothing was written: let a retry run for real. */
export async function releaseIdempotencyKey(userId: string, key: string) {
  await getDb()
    .delete(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key), isNull(idempotencyKeys.response)));
}
