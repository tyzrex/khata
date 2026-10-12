import { z } from "zod";
import { defineRoute } from "@/server/route";
import { getFeed, markFeedRead } from "@/server/services/notifications";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  before: z.string().min(1).max(64).optional(),
});

const patchSchema = z
  .object({
    ids: z.array(z.string().min(1).max(64)).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => value.all === true || (value.ids?.length ?? 0) > 0, "Nothing to mark as read.");

/** GET reads a page of the in-app feed; PATCH marks entries read. */
export const { GET, PATCH } = defineRoute()({
  GET: { query: querySchema, handle: async ({ userId, query }) => Response.json(await getFeed(userId, query)) },
  PATCH: { body: patchSchema, handle: async ({ userId, body }) => Response.json(await markFeedRead(userId, body)) },
});
