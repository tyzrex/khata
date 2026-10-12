import { createAccount, listAccounts } from "@/db/accounts";
import { defineRoute } from "@/server/route";
import { accountSchema } from "@/lib/schemas";

export const { GET, POST } = defineRoute()({
  GET: { handle: async ({ userId }) => Response.json({ accounts: await listAccounts(userId) }) },
  POST: { body: accountSchema, handle: async ({ userId, body }) => Response.json({ account: await createAccount(userId, body.name) }, { status: 201 }) },
});
