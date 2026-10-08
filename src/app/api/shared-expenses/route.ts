import type { NextRequest } from "next/server";
import { createSharedExpense } from "@/db/shares";
import { badRequest, shareError, readJson } from "@/lib/http";
import { expenseWriteSchema, shareIssue } from "@/lib/share-schemas";
import { requireUserId } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = expenseWriteSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(shareIssue(parsed.error));
    const id = await createSharedExpense(userId, parsed.data);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
