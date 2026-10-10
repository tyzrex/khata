import type { NextRequest } from "next/server";
import { createAccount, listAccounts } from "@/db/accounts";
import { isUniqueViolation } from "@/db/ledger";
import { badRequest, jsonError, readJson } from "@/lib/http";
import { accountSchema, issueMessage } from "@/lib/schemas";
import { requireUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    return Response.json({ accounts: await listAccounts(userId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = accountSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const account = await createAccount(userId, parsed.data.name);
    return Response.json({ account }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "An account with that name already exists." }, { status: 409 });
    return jsonError(error);
  }
}