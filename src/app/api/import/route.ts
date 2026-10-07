import type { NextRequest } from "next/server";
import { importTransactions } from "@/db/ledger";
import { badRequest, jsonError } from "@/lib/http";
import { ImportShapeError } from "@/lib/schemas";
import { requireUserId } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const body = await request.json();
    const result = await importTransactions(userId, body);
    if (result.created === 0 && result.updated === 0 && result.invalid.length > 0) {
      return Response.json({ error: "No rows could be imported.", ...result }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof ImportShapeError) return badRequest(error.message);
    if (error instanceof SyntaxError) return badRequest("That body is not JSON.");
    return jsonError(error);
  }
}
