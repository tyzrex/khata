import { z } from "zod";
import { defineRoute } from "@/server/route";
import { createInviteLink } from "@/server/services/invites";

type Context = { id: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address").optional(),
  personId: z.string().trim().min(1).max(100).optional(),
});

/** The body is optional: an empty POST makes a plain shareable link. */
export const { POST } = defineRoute<Context>()({
  POST: {
    body: inviteSchema,
    optionalBody: true,
    handle: async ({ userId, params, body, request }) => Response.json(await createInviteLink(userId, params.id, body, request), { status: 201 }),
  },
});
