import type { NextRequest } from "next/server";
import { deleteAccount, renameAccount } from "@/db/accounts";
import { isUniqueViolation } from "@/db/ledger";
import { badRequest, jsonError, readJson } from "@/lib/http";
import { accountRenameSchema, issueMessage } from "@/lib/schemas";
import { requireUserId } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = accountRenameSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const account = await renameAccount(userId, id, parsed.data.name);
    if (!account) return Response.json({ error: "That account is gone." }, { status: 404 });
    return Response.json({ account });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "An account with that name already exists." }, { status: 409 });
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const result = await deleteAccount(userId, id);
    if (result.status === "missing") return Response.json({ error: "That account is gone." }, { status: 404 });
    if (result.status === "used") {
      return Response.json(
        { error: `${result.name} is still used by entries. Rename it, or move those entries first.` },
        { status: 409 },
      );
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}