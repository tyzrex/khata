import { createGroup } from "@/db/shares";
import { defineRoute } from "@/server/route";
import { groupWriteSchema } from "@/lib/share-schemas";

export const { POST } = defineRoute()({
  POST: { body: groupWriteSchema, handle: async ({ userId, body }) => Response.json({ id: await createGroup(userId, body.name, body.memberIds) }, { status: 201 }) },
});
