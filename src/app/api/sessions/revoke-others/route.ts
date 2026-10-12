import { defineRoute } from "@/server/route";
import { revokeOtherSessions } from "@/server/services/sessions";

/** Sign every other device out. The session making this request survives. */
export const { POST } = defineRoute()({
  POST: {
    snapshot: false,
    handle: async ({ request }) => {
      await revokeOtherSessions(request);
      return Response.json({ status: true });
    },
  },
});
