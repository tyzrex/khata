import type { NextRequest } from "next/server";
import { z } from "zod";
import { deletePushSubscription, getNotificationPreferences, hasPushSubscription, upsertPushSubscription } from "@/db/push-notifications";
import { badRequest, jsonError, readJson } from "@/lib/http";
import { getPushPublicConfiguration, isAllowedPushEndpoint } from "@/lib/push-notifications";
import { requireUserId } from "@/lib/session";

const subscriptionSchema = z.object({
  endpoint: z.string().trim().min(1).max(2000),
  expirationTime: z.number().finite().nullable().optional(),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
  }),
});

const endpointSchema = z.object({ endpoint: z.string().trim().min(1).max(2000) });

/**
 * Notification wiring for this browser. GET reports the VAPID public key plus
 * this account's preferences; POST claims a browser subscription (endpoint
 * moves between accounts); DELETE removes this browser from the account.
 *
 * GET takes the browser's endpoint so it can also answer `registered`: the
 * browser may hold a local subscription the account has never recorded, which
 * is the one state neither the browser nor the account knows about alone.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const { configured, publicKey } = getPushPublicConfiguration();
    const endpoint = request.nextUrl.searchParams.get("endpoint")?.trim() ?? "";
    const registered = endpoint.length > 0 ? await hasPushSubscription(userId, endpoint) : false;
    return Response.json({ configured, publicKey, preferences: await getNotificationPreferences(userId), registered });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = subscriptionSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "That subscription is invalid.");
    const { endpoint, keys } = parsed.data;
    if (!isAllowedPushEndpoint(endpoint)) return badRequest("That push endpoint is not from a supported push service.");
    try {
      await upsertPushSubscription(userId, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
    } catch (error) {
      if (error instanceof Error && error.name === "PushSubscriptionLimitError") return badRequest(error.message);
      throw error;
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const parsed = endpointSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "That request is invalid.");
    await deletePushSubscription(userId, parsed.data.endpoint);
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
