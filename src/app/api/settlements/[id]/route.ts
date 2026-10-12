import { noContent } from "@/server/http";
import { defineRoute } from "@/server/route";
import { editSettlement, removeSettlement } from "@/server/services/shared-writes";
import { settlementWriteSchema } from "@/lib/share-schemas";

type Context = { id: string };

export const { PATCH, DELETE } = defineRoute<Context>()({
  PATCH: {
    body: settlementWriteSchema,
    handle: async ({ userId, params, body }) => {
      await editSettlement(userId, params.id, body);
      return Response.json({ id: params.id });
    },
  },
  DELETE: {
    handle: async ({ userId, params }) => {
      await removeSettlement(userId, params.id);
      return noContent();
    },
  },
});
