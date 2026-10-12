import { defineRoute } from "@/server/route";
import { deleteTransaction, editEntry } from "@/server/services/ledger";
import { noContent } from "@/server/http";
import { NotFoundError } from "@/server/errors";
import { manualTransactionSchema } from "@/lib/schemas";

type Context = { id: string };

export const { PATCH, DELETE } = defineRoute<Context>()({
  PATCH: {
    body: manualTransactionSchema,
    handle: async ({ userId, params, body }) => Response.json({ transaction: await editEntry(userId, params.id, body) }),
  },
  DELETE: {
    handle: async ({ userId, params }) => {
      if (!(await deleteTransaction(userId, params.id))) throw new NotFoundError("That entry is no longer in the ledger.");
      return noContent();
    },
  },
});
