import type { NextRequest } from "next/server";
import { exportTransactions } from "@/db/ledger";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const body = await exportTransactions(userId);
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
