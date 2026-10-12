import { deleteAccount, renameAccount } from "@/db/accounts";
import { noContent } from "@/server/http";
import { defineRoute } from "@/server/route";
import { accountRenameSchema } from "@/lib/schemas";

type Context = { id: string };

export const { PATCH, DELETE } = defineRoute<Context>()({
  PATCH: {
    body: accountRenameSchema,
    handle: async ({ userId, params, body }) => Response.json({ account: await renameAccount(userId, params.id, body.name) }),
  },
  DELETE: {
    handle: async ({ userId, params }) => {
      await deleteAccount(userId, params.id);
      return noContent();
    },
  },
});
