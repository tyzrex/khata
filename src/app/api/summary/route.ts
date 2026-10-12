import { defineRoute } from "@/server/route";
import { summarizeLedger } from "@/server/services/ledger";

export const { GET } = defineRoute()({
  GET: { handle: async ({ userId }) => Response.json(await summarizeLedger(userId)) },
});
