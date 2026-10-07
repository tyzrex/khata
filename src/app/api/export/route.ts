import { exportTransactions } from "@/db/ledger";
import { beginRequest, jsonError } from "@/lib/http";

export async function GET() {
  await beginRequest();
  try {
    const body = await exportTransactions();
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="khata-export.json"',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
