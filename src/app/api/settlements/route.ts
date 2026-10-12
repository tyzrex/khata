import { defineRoute } from "@/server/route";
import { recordSettlement } from "@/server/services/shared-writes";
import { settlementWriteSchema } from "@/lib/share-schemas";

export const { POST } = defineRoute()({
  POST: {
    body: settlementWriteSchema,
    handle: async ({ userId, body }) => Response.json({ id: await recordSettlement(userId, body) }, { status: 201 }),
  },
});
