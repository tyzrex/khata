import { defineRoute } from "@/server/route";
import { redeemInvite } from "@/server/services/invites";

type Context = { token: string };

export const { POST } = defineRoute<Context>()({
  POST: { handle: async ({ userId, params, request }) => Response.json(await redeemInvite(request, userId, params.token)) },
});
