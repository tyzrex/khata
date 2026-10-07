import type { NextRequest } from "next/server";
import { createTransaction, listTransactions } from "@/db/ledger";
import { TX_TYPES, type TxType } from "@/lib/constants";
import { badRequest, jsonError } from "@/lib/http";
import { issueMessage, manualTransactionSchema } from "@/lib/schemas";
import { requireUserId } from "@/lib/session";

function isType(value: string | null): value is TxType {
  return TX_TYPES.some((type) => type === value);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");
    if (type && !isType(type)) return badRequest("Type must be expense, income, or transfer.");
    const rows = await listTransactions(userId, {
      q: searchParams.get("q")?.trim() || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      type: type && isType(type) ? type : undefined,
      category: searchParams.get("category") || undefined,
    });
    return Response.json({ transactions: rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = manualTransactionSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const transaction = await createTransaction(userId, parsed.data);
    return Response.json({ transaction }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
