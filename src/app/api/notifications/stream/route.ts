import { defineRoute } from "@/server/route";
import { feedFrame, subscribeToFeed, type FeedEvent } from "@/server/notification-stream";

/**
 * A comment line, not an event. Proxies and load balancers close an idle
 * connection, and on a phone that means the difference between a live feed and a
 * silently dead one. Twenty seconds is comfortably inside the range that every
 * intermediary tolerates.
 */
const HEARTBEAT_MS = 20_000;

/**
 * How long the platform will hold this function open before stopping it.
 *
 * A stream has no natural end, so something has to cut it. Vercel takes this
 * from the build output, and without it a connection ends at whatever the plan's
 * default happens to be — which on a phone is often shorter than the tab is
 * useful. Long is still not forever; the browser reconnects, and the poll is
 * running alongside it either way.
 */
export const maxDuration = 300;

/**
 * The live feed, as server-sent events.
 *
 * Polling every minute was answering the right question too slowly. The case that
 * matters is a shared expense landing while somebody has the app open, and that is
 * exactly when they are already looking at the screen. This pushes the moment it
 * happens instead of up to a minute later.
 *
 * The stream carries no data. It says "your feed moved" and the browser refetches
 * through the same `GET /api/notifications` the poll already uses, so there is one
 * code path for turning a feed into what you see and no second shape to keep in
 * step with the first.
 *
 * Events are announced over Postgres rather than held in this instance's memory,
 * so a write served by one function instance reaches a stream held by another —
 * which on this deployment is most of the time. See `notification-stream.ts`.
 *
 * Vercel stops a function after its configured maximum, so this connection is
 * expected to end without warning now and then. `EventSource` reconnects on its
 * own, the poll runs alongside it as a backstop, and neither depends on the other.
 */
export const { GET } = defineRoute()({
  GET: {
    handle: ({ request, userId }) => {
      const encoder = new TextEncoder();
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let unsubscribe: (() => void) | undefined;

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (chunk: string) => {
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              // The tab went away between the event and the write. Nothing to do.
            }
          };

          // Tell the browser how long to wait before reconnecting, then confirm the
          // connection is live before it starts waiting on anything.
          send("retry: 3000\n\n");
          unsubscribe = await subscribeToFeed(userId, (event: FeedEvent) => send(feedFrame({ activity: Boolean(event.activity) })));
          send("event: ready\ndata: {}\n\n");

          heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
          request.signal.addEventListener("abort", () => controller.close(), { once: true });
        },
        cancel() {
          clearInterval(heartbeat);
          unsubscribe?.();
        },
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          // The stream is a second representation of the feed the poll already asks
          // for, and a shared cache must never be left holding one open.
          "cache-control": "no-store",
          connection: "keep-alive",
          // Stops nginx and friends from buffering the stream into one lump delivered
          // when the response finally ends — which, for an event stream, is never.
          // Without this the feature would appear to work and deliver nothing.
          "x-accel-buffering": "no",
        },
      });
    },
  },
});