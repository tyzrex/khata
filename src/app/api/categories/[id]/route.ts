import { deleteCategory, updateCategory } from "@/db/categories";
import { noContent } from "@/server/http";
import { defineRoute } from "@/server/route";
import { categorySchema } from "@/lib/schemas";

type Context = { id: string };

export const { PATCH, DELETE } = defineRoute<Context>()({
  PATCH: {
    body: categorySchema,
    handle: async ({ userId, params, body }) => Response.json({ category: await updateCategory(userId, params.id, body) }),
  },
  DELETE: {
    handle: async ({ userId, params }) => {
      await deleteCategory(userId, params.id);
      return noContent();
    },
  },
});
