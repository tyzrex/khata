import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { account, session } from "@/db/schema";

/**
 * Whether the person signed up with a password, as opposed to arriving through
 * Google. It decides which account controls are meaningful: changing a password
 * needs a credential account, and confirming a deletion by password needs one too.
 */
export async function hasPasswordCredential(userId: string) {
  const rows = await getDb()
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return Boolean(rows[0]?.password);
}

export type SessionDto = {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** True for the session making this request. */
  current: boolean;
};

/**
 * Signed-in sessions, newest first. Read straight from the table rather than
 * through better-auth's /list-sessions, which is gated behind a session-freshness
 * check: `session.freshAge` defaults to a day and `createdAt` is never refreshed,
 * so a month-old but perfectly valid session would be told it is too old to see
 * its own session list. Revocation still goes through better-auth.
 *
 * Expiry is filtered in SQL. `session.expires_at` is `withTimezone`, so the
 * stored value and the database's `now()` are the same kind of instant and the
 * comparison is exact — see the note on the auth tables in `db/auth-schema.ts`
 * for what this column used to be.
 *
 * The session token is deliberately not returned; callers revoke by id.
 */
export async function listUserSessions(userId: string, currentToken: string | null): Promise<SessionDto[]> {
  const now = new Date();
  const rows = await getDb()
    .select({
      id: session.id,
      token: session.token,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, now)))
    .orderBy(desc(session.createdAt));
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    current: Boolean(currentToken) && row.token === currentToken,
  }));
}

/** Maps a public session id to its token. Scoped to the user, so it cannot reach anyone else's. */
export async function tokenForSessionId(userId: string, sessionId: string) {
  const rows = await getDb()
    .select({ token: session.token })
    .from(session)
    .where(and(eq(session.userId, userId), eq(session.id, sessionId)))
    .limit(1);
  return rows[0]?.token ?? null;
}