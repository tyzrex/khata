import { defineRoute } from "@/server/route";
import { recordSettlement } from "@/server/services/shared-writes";
import { settlementWriteSchema } from "@/lib/share-schemas";
import { idempotencyKeyOf, once } from "@/server/idempotency";

export const { POST } = defineRoute()({
  POST: {
    body: settlementWriteSchema,
    handle: async ({ request, userId, body }) => {
      const { result } = await once(userId, "settlement", idempotencyKeyOf(request), body, async () => ({ id: await recordSettlement(userId, body) }));
      return Response.json(result, { status: 201 });
    },
  },
});
