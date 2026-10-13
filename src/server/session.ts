import { cacheLife } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identityForApiKey } from "@/db/api-keys";
import type { AgentIdentity } from "@/lib/agent-permissions";
import { isApiKey, readApiKey } from "@/server/agent/keys";
import { getAuth } from "@/server/auth";
import { beginRequest } from "@/server/http";
import { UnauthorizedError } from "@/server/errors";

export async function requireUserId(request: Request) {
  await beginRequest();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) throw new UnauthorizedError();
  return session.user.id;
}

/**
 * The signed-in account for a page render.
 *
 * A session cannot be validated inside a plain `use cache` scope — the check reads
 * the cookie and compares its expiry against the clock — which is what
 * `use cache: private` exists for. It reads `headers()` itself, keeps the result in
 * the browser only, and gives the lifetime that lets the router prefetch this
 * route's App Shell for the current session, so moving between the eleven sections
 * paints instantly instead of re-running the check every time.
 *
 * `redirect()` throws rather than returning, so a signed-out visitor is never
 * cached — only a resolved user is, and only in that browser tab. That is the
 * whole reason this function redirects instead of returning `null`: a cached
 * `null` would bounce somebody straight back to the sign-in page for the full
 * five minutes after they signed in, and the sign-in page is precisely the one
 * route that must be able to ask the question without that answer.
 *
 * Five minutes matches the cookie cache Better Auth already keeps server-side in
 * `createAuth`, so this does not widen the window a revoked session stays usable
 * for: the API still refuses every call the moment it stops, and the shell
 * redirects on the first 401 it sees.
 */
export async function readPageSession() {
  "use cache: private";
  cacheLife({ stale: 300 });

  const session = await getAuth().api.getSession({ headers: await headers() });
  // Thrown, not returned: see above. This is what keeps a miss out of the cache.
  if (!session?.user) redirect("/login");

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified === true,
  };
}

/**
 * The same question, asked by a page that has to cope with "no".
 *
 * `/login` and `/reset-password` are public on purpose — a reset link has to work
 * for someone who cannot sign in — so redirecting them away would loop. This is
 * uncached rather than a cached miss for the reason above, and it costs one cheap
 * check on a page that is barely loaded.
 */
export async function peekPageSession() {
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
export async function requireAgentIdentity(request: Request): Promise<AgentIdentity> {
  await beginRequest();
  const key = readApiKey(request.headers);
  if (key) {
    const identity = isApiKey(key) ? await identityForApiKey(key) : null;
    if (!identity) throw new UnauthorizedError();
    return identity;
  }
  return { userId: await requireUserId(request), viaApiKey: false };
}
