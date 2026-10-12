import { revokeApiKey } from "@/db/api-keys";
import { noContent } from "@/server/http";
import { NotFoundError } from "@/server/errors";
import { defineRoute } from "@/server/route";

type Context = { id: string };

/** Revokes a key at once. Bots using it get 401 on their next call. */
export const { DELETE } = defineRoute<Context>()({
  DELETE: {
    snapshot: false,
    handle: async ({ userId, params }) => {
      if (!(await revokeApiKey(userId, params.id))) throw new NotFoundError("That key is not active.");
      return noContent();
    },
  },
});
