import { defineRoute } from "@/server/route";
import { createTransaction, listTransactions } from "@/server/services/ledger";
import { manualTransactionSchema, transactionFiltersSchema } from "@/lib/schemas";
import { idempotencyKeyOf } from "@/server/idempotency";

export const { GET, POST } = defineRoute()({
  GET: {
    query: transactionFiltersSchema,
    handle: async ({ userId, query }) => Response.json({ transactions: await listTransactions(userId, query) }),
  },
  POST: {
    body: manualTransactionSchema,
    handle: async ({ request, userId, body }) => Response.json({ transaction: await createTransaction(userId, body, idempotencyKeyOf(request) ?? undefined) }, { status: 201 }),
  },
});
