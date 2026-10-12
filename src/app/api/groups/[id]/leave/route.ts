import { leaveGroup } from "@/db/shares";
import { noContent } from "@/server/http";
import { defineRoute } from "@/server/route";

type Context = { id: string };

export const { POST } = defineRoute<Context>()({
  POST: {
    handle: async ({ userId, params }) => {
      await leaveGroup(userId, params.id);
      return noContent();
    },
  },
});
