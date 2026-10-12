import { getShareBook } from "@/db/shares";
import { defineRoute } from "@/server/route";

export const { GET } = defineRoute()({
  GET: { handle: async ({ userId }) => Response.json(await getShareBook(userId)) },
});
