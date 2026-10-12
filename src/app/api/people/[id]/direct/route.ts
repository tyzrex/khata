import { ensureDirectGroup } from "@/db/shares";
import { defineRoute } from "@/server/route";

type Context = { id: string };

/** Find or create the hidden two-person book between you and this friend. */
export const { POST } = defineRoute<Context>()({
  POST: { handle: async ({ userId, params }) => Response.json({ id: await ensureDirectGroup(userId, params.id) }) },
});
