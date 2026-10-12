import { defineRoute } from "@/server/route";
import { addSharedExpense } from "@/server/services/shared-writes";
import { expenseWriteSchema } from "@/lib/share-schemas";
import { idempotencyKeyOf, once } from "@/server/idempotency";

export const { POST } = defineRoute()({
  POST: {
    body: expenseWriteSchema,
    // The form sends one `Idempotency-Key` per submission, so a double-click or a retry after a dropped
    // response returns the first expense's id instead of adding another.
    handle: async ({ request, userId, body }) => {
      const { result } = await once(userId, "shared-expense", idempotencyKeyOf(request), body, async () => ({ id: await addSharedExpense(userId, body) }));
      return Response.json(result, { status: 201 });
    },
  },
});
