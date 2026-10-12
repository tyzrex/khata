import { deletePerson, renamePerson } from "@/db/shares";
import { noContent } from "@/server/http";
import { defineRoute } from "@/server/route";
import { personWriteSchema } from "@/lib/share-schemas";

type Context = { id: string };

export const { PATCH, DELETE } = defineRoute<Context>()({
  PATCH: {
    body: personWriteSchema,
    handle: async ({ userId, params, body }) => Response.json({ person: await renamePerson(userId, params.id, body.name) }),
  },
  DELETE: {
    handle: async ({ userId, params }) => {
      await deletePerson(userId, params.id);
      return noContent();
    },
  },
});
