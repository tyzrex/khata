import type { NextRequest } from "next/server";
import { importTransactions } from "@/db/ledger";
import { badRequest, beginRequest, jsonError } from "@/lib/http";
import { ImportShapeError } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  await beginRequest();
  try {
    const body = await request.json();
    const result = await importTransactions(body);
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
