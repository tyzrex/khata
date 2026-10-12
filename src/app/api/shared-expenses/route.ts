import { defineRoute } from "@/server/route";
import { addSharedExpense } from "@/server/services/shared-writes";
import { expenseWriteSchema } from "@/lib/share-schemas";

export const { POST } = defineRoute()({
  POST: {
    body: expenseWriteSchema,
    handle: async ({ userId, body }) => Response.json({ id: await addSharedExpense(userId, body) }, { status: 201 }),
  },
});
