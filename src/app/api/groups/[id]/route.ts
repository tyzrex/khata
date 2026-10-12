import { deleteGroup, updateGroup } from "@/db/shares";
import { noContent } from "@/server/http";
import { defineRoute } from "@/server/route";
import { groupPatchSchema } from "@/lib/share-schemas";

type Context = { id: string };

export const { PATCH, DELETE } = defineRoute<Context>()({
  PATCH: {
    body: groupPatchSchema,
    handle: async ({ userId, params, body }) => {
      await updateGroup(userId, params.id, body);
      return Response.json({ ok: true });
    },
  },
  DELETE: {
    handle: async ({ userId, params }) => {
      await deleteGroup(userId, params.id);
      return noContent();
    },
  },
});
