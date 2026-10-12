import { accountFlags } from "@/db/profile";
import { defineRoute } from "@/server/route";

export const { GET } = defineRoute()({
  GET: { handle: async ({ userId }) => Response.json(await accountFlags(userId)) },
});
