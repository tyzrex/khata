import { defineRoute } from "@/server/route";
import { revokeSession } from "@/server/services/sessions";

type Context = { id: string };

/** Signing a device out is idempotent: the goal is "not signed in", whatever was there before. */
export const { DELETE } = defineRoute<Context>()({
  DELETE: {
    snapshot: false,
    handle: async ({ userId, params, request }) => {
      await revokeSession(userId, params.id, request);
      return Response.json({ status: true });
    },
  },
});
