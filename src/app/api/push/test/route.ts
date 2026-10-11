import type { NextRequest } from "next/server";
import { jsonError, tooManyRequests } from "@/lib/http";
import { sendTestPush } from "@/lib/push-notifications";
import { limits } from "@/lib/request-guard";
import { requireUserId } from "@/lib/session";

/** Sends a test push to every browser registered on this account. Rate limited. */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const limit = limits.pushTests.take(userId);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);
    const result = await sendTestPush(userId);
    if (!result.configured) return Response.json({ error: "Khata's notification service is not configured yet." }, { status: 503 });
    if (!result.attempted) return Response.json({ error: "This browser is not registered for notifications yet. Enable them first." }, { status: 404 });
    return Response.json({ sent: result.sent });
  } catch (error) {
    return jsonError(error);
  }
}
