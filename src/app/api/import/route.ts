import type { NextRequest } from "next/server";
import { importTransactions } from "@/db/ledger";
import { badRequest, jsonError, readJson, tooManyRequests } from "@/lib/http";
import { limits } from "@/lib/request-guard";
import { ImportShapeError } from "@/lib/schemas";
import { requireUserId } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const limit = limits.bulkWrites.take(userId);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);
    const body = await readJson(request);
    const result = await importTransactions(userId, body);
    if (result.created === 0 && result.updated === 0 && result.invalid.length > 0) {
      return Response.json({ error: "No rows could be imported.", ...result }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof ImportShapeError) return badRequest(error.message);
    return jsonError(error);
  }
}
