import { createPerson } from "@/db/shares";
import { defineRoute } from "@/server/route";
import { personWriteSchema } from "@/lib/share-schemas";

export const { POST } = defineRoute()({
  POST: { body: personWriteSchema, handle: async ({ userId, body }) => Response.json({ person: await createPerson(userId, body.name) }, { status: 201 }) },
});
