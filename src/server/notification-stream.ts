import { Client } from "pg";

/**
 * The live channel the notification stream rides on.
 *
 * Polling asked "has anything happened?" once a minute. This asks the same
 * question and is answered the moment the answer changes, because a shared
 * expense landing in someone's book is the sort of thing you want to see while
 * you are looking at the screen rather than a minute later.
 *
 * The transport is Postgres `LISTEN`/`NOTIFY`, and that choice is the whole
 * design. An in-process `EventEmitter` would be less code, but the app runs on
 * serverless where a write and the stream watching for it are usually two
 * different function instances that share nothing — so the event would be
 * published into memory nobody is listening to. The database is the one thing
 * every instance already has a connection to, which makes it the only place a
 * notification can be announced to all of them at once.
 *
 * `NOTIFY` payloads are capped at 8000 bytes, ample for the ids and kinds sent
 * here, and delivery is fire-and-forget: if nobody is listening the message is
 * dropped. Nothing in here is allowed to become load-bearing for a write, which is
 * why the feed keeps polling as well — see `notifications-query.ts`.
 */

const CHANNEL = "khata_notifications";

/** How long to leave a dropped listener alone before building a new one. */
const RETRY_BACKOFF_MS = 30_000;

/**
 * The connection the listener must open, which is not the one the rest of the app uses.
 *
 * Neon (and PgBouncer in transaction mode generally) hands out `DATABASE_URL`
 * through a pooler that multiplexes many sessions over one socket. A `LISTEN`
 * registered on such a connection is attached to a backend the client is not
 * guaranteed to still be talking to, so notifications are never delivered — the
 * stream opens, heartbeats happily, and silently receives nothing. `LISTEN`
 * requires a session that is yours for as long as you are listening, which is
 * what the unpooled URL is for.
 *
 * `NOTIFY` is the opposite: it is an ordinary function call, so sending one from
 * the pool is fine and cheaper. Only the listening side needs its own connection.
 */
function listenerUrl() {
  return process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
}

/** What a listener is told. Small on purpose: it is a signal, not a payload. */
export type FeedEvent = {
  userId: string;
  /** Why the feed moved, so the client can refetch more than just the bell. */
  kind: "created" | "read";
  /** Present on `created`, so a shared write can also refresh the balances. */
  activity?: boolean;
};

type Listener = (event: FeedEvent) => void;

/**
 * One server-sent frame.
 *
 * The wire format needs the blank line after the data or the browser will not
 * dispatch the event at all, and it needs to be spelled the same way every time,
 * so it is written once here rather than assembled at the call site.
 */
export function feedFrame(signal: { activity: boolean }): string {
  return `event: feed\ndata: ${JSON.stringify(signal)}\n\n`;
}

/**
 * Who is watching, and the rule for what reaches them.
 *
 * Split out from the connection so the part that can go wrong — an event for one
 * account reaching somebody else's open tab — is testable without a database.
 */
export function createFeedHub() {
  const listeners = new Set<Listener>();
  return {
    listen(userId: string, listener: Listener) {
      const scoped: Listener = (event) => {
        if (event.userId === userId) listener(event);
      };
      listeners.add(scoped);
      return () => void listeners.delete(scoped);
    },
    dispatch(event: FeedEvent) {
      for (const listener of listeners) listener(event);
    },
    get size() {
      return listeners.size;
    },
  };
}

type Hub = ReturnType<typeof createFeedHub>;

/**
 * One listening connection and one set of watchers per instance.
 *
 * Held on `globalThis` because a Next.js module can be evaluated more than once
 * in development — without this, a hot reload would leave the previous client
 * open and leaking, and every edit would add another.
 */
const globalForStream = globalThis as unknown as { khataStream?: Stream };

type Stream = {
  hub: Hub;
  client: Client | null;
  connecting: Promise<void> | null;
  /** Do not hammer a database that is already refusing us. */
  retryAfter: number;
};

function state(): Stream {
  globalForStream.khataStream ??= { hub: createFeedHub(), client: null, connecting: null, retryAfter: 0 };
  return globalForStream.khataStream;
}

/**
 * Open the connection once, quietly, and keep it open.
 *
 * A failure here is not an error the caller should see: nobody has asked for a
 * notification yet, and the feed still polls. It only starts to matter once
 * somebody is watching, so a failure is recorded and the next subscribe tries
 * again rather than throwing into a request that would otherwise have worked.
 *
 * The client is discarded on every failure rather than reused. `pg` refuses to
 * connect a client twice, so a half-open one — connected, then dropped by the
 * database — would make every later attempt fail with "cannot reuse a client"
 * and leave the stream permanently deaf while looking perfectly healthy.
 */
async function ensureListening(): Promise<void> {
  // Nothing to listen to without a database. The feed still polls, so this is a
  // missing feature rather than a broken one — and it keeps the module usable in
  // a test environment that has no `DATABASE_URL` at all.
  const url = listenerUrl();
  if (!url) return;

  const stream = state();
  if (stream.client) return;
  if (Date.now() < stream.retryAfter) return;

  stream.client = new Client({ connectionString: url });
  const client = stream.client;

  stream.connecting ??= (async () => {
    client.on("notification", (message) => {
      if (message.channel !== CHANNEL || !message.payload) return;
      try {
        state().hub.dispatch(JSON.parse(message.payload) as FeedEvent);
      } catch {
        // A payload we cannot read is not worth tearing the connection down for.
      }
    });

    // A database that goes away takes the subscription with it. Give the client
    // back so the next subscribe builds a fresh one, and clear the parked promise
    // so it does not skip connecting that one.
    const drop = (error?: unknown) => {
      if (state().client !== client) return;
      state().client = null;
      state().connecting = null;
      state().retryAfter = Date.now() + RETRY_BACKOFF_MS;
      if (error) console.error("Notification listener dropped", error);
      void client.end().catch(() => undefined);
    };
    client.on("error", drop);
    client.on("end", () => drop());

    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
    } catch (error) {
      drop(error);
    }
  })();

  return stream.connecting;
}

/** Announce that one account's feed moved. */
export async function publishFeedEvent(event: FeedEvent) {
  if (!process.env.DATABASE_URL) return;
  try {
    const { getPool } = await import("@/db/client");
    await getPool().query("SELECT pg_notify($1, $2)", [CHANNEL, JSON.stringify(event)]);
  } catch (error) {
    console.error("Could not announce a feed event", error);
  }
}

/**
 * Watch one account's feed. Returns the unsubscribe.
 *
 * The caller is a streaming response that lives until the tab closes, so the
 * cleanup matters as much as the subscribe: a dropped connection that leaves its
 * watcher behind would keep every future event alive for nobody.
 */
export async function subscribeToFeed(userId: string, listener: Listener): Promise<() => void> {
  const off = state().hub.listen(userId, listener);
  await ensureListening();
  return off;
}