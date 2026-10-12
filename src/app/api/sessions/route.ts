import { defineRoute } from "@/server/route";
import { readSessions } from "@/server/services/sessions";

/**
 * Signed-in sessions for the account settings screen. This reads the session
 * table itself (see `db/profile.ts` for why) and does not go through better-auth's
 * /list-sessions, which refuses to answer once a session is older than
 * `session.freshAge`.
 */
export const { GET } = defineRoute()({
  GET: { handle: async ({ userId, request }) => Response.json({ sessions: await readSessions(userId, request) }) },
});
