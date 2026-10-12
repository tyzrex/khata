import { noContent } from "@/server/http";
import { defineRoute } from "@/server/route";
import { editSharedExpense, removeSharedExpense } from "@/server/services/shared-writes";
import { expenseWriteSchema } from "@/lib/share-schemas";

type Context = { id: string };

export const { PATCH, DELETE } = defineRoute<Context>()({
  PATCH: {
    body: expenseWriteSchema,
    handle: async ({ userId, params, body }) => {
      await editSharedExpense(userId, params.id, body);
      return Response.json({ id: params.id });
    },
  },
  DELETE: {
    handle: async ({ userId, params }) => {
      await removeSharedExpense(userId, params.id);
      return noContent();
    },
  },
});
