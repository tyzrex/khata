import { z } from "zod";
import { defineRoute, type RouteParams } from "@/server/route";
import { noContent } from "@/server/http";
import { readRegistration, registerSubscription, removeSubscription } from "@/server/services/push-subscriptions";

const subscriptionSchema = z.object({
  endpoint: z.string().trim().min(1).max(2000),
  expirationTime: z.number().finite().nullable().optional(),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
  }),
});

const endpointSchema = z.object({ endpoint: z.string().trim().min(1).max(2000) });

/** POST and DELETE take different bodies, so both are parsed as one shape here. */
type PushBody = z.infer<typeof subscriptionSchema> | z.infer<typeof endpointSchema>;

/**
 * Notification wiring for this browser. GET reports the VAPID public key plus
 * this account's preferences; POST claims a browser subscription (the endpoint
 * moves between accounts); DELETE removes this browser from the account.
 */
export const { GET, POST, DELETE } = defineRoute<RouteParams, never, PushBody>()({
  GET: { handle: async ({ userId, url }) => Response.json(await readRegistration(userId, url.searchParams.get("endpoint")?.trim() ?? "")) },
  POST: {
    snapshot: false,
    body: subscriptionSchema,
    handle: async ({ userId, body }) => {
      await registerSubscription(userId, body);
      return noContent();
    },
  },
  DELETE: {
    snapshot: false,
    body: endpointSchema,
    handle: async ({ userId, body }) => {
      await removeSubscription(userId, body.endpoint);
      return noContent();
    },
  },
});
