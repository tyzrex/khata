import { listUserSessions, tokenForSessionId } from "@/db/profile";
import { getAuth } from "@/server/auth";

/**
 * Signing devices in and out.
 *
 * Reading goes straight to the session table (see `db/profile.ts` for why
 * better-auth's own list refuses once a session is older than `freshAge`);
 * revoking goes back through better-auth so the cookie cache is invalidated.
 * Keeping both halves here means the two paths cannot drift apart on what a
 * session id is allowed to reach.
 */

export { listUserSessions };

export async function readSessions(userId: string, request: Request) {
  const current = await getAuth().api.getSession({ headers: request.headers });
  return listUserSessions(userId, current?.session.token ?? null);
}

/**
 * Sign a device out by its public id. The token never reaches the browser, so the
 * id is resolved to a token here — scoped to the signed-in user, so a guessed id
 * cannot reach anyone else's session. better-auth treats revoking an unknown token
 * as success, which is the right answer here: the goal is "not signed in".
 */
export async function revokeSession(userId: string, sessionId: string, request: Request) {
  const token = await tokenForSessionId(userId, sessionId);
  if (!token) return;
  await getAuth().api.revokeSession({ body: { token }, headers: request.headers });
}

/** Sign every other device out. The session making this request survives. */
export async function revokeOtherSessions(request: Request) {
  await getAuth().api.revokeOtherSessions({ headers: request.headers });
}