import type { NextRequest } from "next/server";
import { createApiKey, listApiKeys } from "@/db/api-keys";
import { keyInput } from "@/lib/agent/schemas";
import { badRequest, readJson, shareError, tooManyRequests } from "@/lib/http";
import { limits } from "@/lib/request-guard";
import { issueMessage } from "@/lib/schemas";
import { requireUserId } from "@/lib/session";

/** Key management needs a signed-in session: an API key cannot mint or list other keys. */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    return Response.json({ keys: await listApiKeys(userId) });
  } catch (error) {
    return shareError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const limit = limits.apiKeys.take(userId);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);
    const parsed = keyInput.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(issueMessage(parsed.error));
    const { key, token } = await createApiKey(userId, parsed.data.name);
    return Response.json({ key, token }, { status: 201 });
  } catch (error) {
    return shareError(error);
  }
}
