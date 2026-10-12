import { defineRoute } from "@/server/route";
import { readInvite } from "@/server/services/invites";

type Context = { token: string };

/** Public: anyone holding the link can see who it is from. Malformed tokens never reach the database. */
export const { GET } = defineRoute<Context>()({
  GET: {
    auth: "public",
    handle: async ({ params, request }) => Response.json(await readInvite(request, params.token), { headers: { "cache-control": "no-store" } }),
  },
});
