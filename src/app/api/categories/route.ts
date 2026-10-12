import { createCategory, listCategories } from "@/db/categories";
import { defineRoute } from "@/server/route";
import { categorySchema } from "@/lib/schemas";

export const { GET, POST } = defineRoute()({
  GET: { handle: async ({ userId }) => Response.json({ categories: await listCategories(userId) }) },
  POST: { body: categorySchema, handle: async ({ userId, body }) => Response.json({ category: await createCategory(userId, body) }, { status: 201 }) },
});
