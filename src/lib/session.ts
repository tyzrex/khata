import { headers } from "next/headers";
import { userIdForApiKey } from "@/db/api-keys";
import { hasPasswordCredential } from "@/db/profile";
import { isApiKey, readApiKey } from "@/lib/agent/keys";
import { getAuth } from "@/lib/auth";
import { beginRequest, UnauthorizedError } from "@/lib/http";

export async function requireUserId(request: Request) {
  await beginRequest();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) throw new UnauthorizedError();
  return session.user.id;
}

export async function readPageSession() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified === true,
  };
}

/**
 * What the account settings screen needs beyond the session: whether this person
 * ever set a password, which decides whether "change password" and a
 * password-confirmed deletion are offered at all.
 */
export async function readAccountFlags(userId: string) {
  return { hasPassword: await hasPasswordCredential(userId) };
}

/**
 * For the /api/v1 agent routes: a personal API key (`Authorization: Bearer khata_...`
 * or `X-API-Key`) or, failing that, a normal session. A key that is present but
 * unknown or revoked is refused outright rather than falling back.
 */
export async function requireAgentUserId(request: Request) {
  return (await requireAgentIdentity(request)).userId;
}

/**
 * The same check, but it also says *how* the caller proved who they are. The agent
 * routes need that: a bot writes as you, so if notifications went to everyone except
 * the actor you would never hear about the expense your own bot just added. So a
 * write made with an API key notifies you too.
 */
export async function requireAgentIdentity(request: Request): Promise<{ userId: string; viaApiKey: boolean }> {
  await beginRequest();
  const key = readApiKey(request.headers);
  if (key) {
    const userId = isApiKey(key) ? await userIdForApiKey(key) : null;
    if (!userId) throw new UnauthorizedError();
    return { userId, viaApiKey: true };
  }
  return { userId: await requireUserId(request), viaApiKey: false };
}
