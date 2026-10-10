import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/agent/keys";
import { ShareInputError } from "@/lib/split";

/** Active keys one account may hold at once. */
export const MAX_ACTIVE_KEYS = 10;

/** last_used_at is refreshed at most this often, so a busy bot does not write on every call. */
const TOUCH_EVERY_MS = 60_000;

export type ApiKeyDto = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

function toDto(row: typeof apiKeys.$inferSelect): ApiKeyDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listApiKeys(userId: string) {
  const rows = await getDb()
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(asc(apiKeys.createdAt));
  return rows.map(toDto);
}

/** Creates a key and returns the plaintext once. Only its hash is stored. */
export async function createApiKey(userId: string, name: string) {
  const active = await listApiKeys(userId);
  if (active.length >= MAX_ACTIVE_KEYS) throw new ShareInputError(`You already have ${MAX_ACTIVE_KEYS} keys. Revoke one first.`);
  const { token, prefix, hash } = generateApiKey();
  const [row] = await getDb()
    .insert(apiKeys)
    .values({ id: crypto.randomUUID(), userId, name, prefix, keyHash: hash })
    .returning();
  return { key: toDto(row!), token };
}

export async function revokeApiKey(userId: string, id: string) {
  const rows = await getDb()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

/** The account behind an active key, or null. */
export async function userIdForApiKey(token: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(token)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  const now = new Date();
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    const stale = new Date(now.getTime() - TOUCH_EVERY_MS);
    await db
      .update(apiKeys)
      .set({ lastUsedAt: now })
      .where(and(eq(apiKeys.id, row.id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, stale))));
  }
  return row.userId;
}
