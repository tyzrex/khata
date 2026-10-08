import type { NextRequest } from "next/server";
import { createTransaction, listTransactions } from "@/db/ledger";
import { badRequest, jsonError, readJson } from "@/lib/http";
import { issueMessage, manualTransactionSchema, transactionFiltersSchema } from "@/lib/schemas";
import { requireUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = transactionFiltersSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const rows = await listTransactions(userId, parsed.data);
    return Response.json({ transactions: rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = manualTransactionSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const transaction = await createTransaction(userId, parsed.data);
    return Response.json({ transaction }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
