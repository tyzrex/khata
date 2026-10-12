import { defineRoute } from "@/server/route";
import { exportTransactions } from "@/server/services/ledger";

export const { GET } = defineRoute()({
  GET: {
    handle: async ({ userId }) =>
      new Response(JSON.stringify(await exportTransactions(userId), null, 2), {
        headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="khata-export.json"' },
      }),
  },
});
