import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { defineAgentRoute, defineRoute, type RouteRuntime } from "@/server/route";
import { ConflictError, UnauthorizedError } from "@/server/errors";
import { ReportError } from "@/server/http";
import { createRateLimiter } from "@/server/request-guard";

/**
 * `defineRoute` owns four things every handler used to repeat: marking the route
 * dynamic, proving who the caller is, validating input, and turning a throw into
 * a response. Each one is tested here against a stub runtime, so the guarantees
 * hold without a database or a session.
 */

/** A runtime that records what it was asked to do and answers with fixed values. */
function stub(overrides: Partial<RouteRuntime> = {}) {
  const calls: string[] = [];
  const runtime: RouteRuntime = {
    begin: async () => void calls.push("begin"),
    session: async () => {
      calls.push("session");
      return "user-1";
    },
    agent: async () => {
      calls.push("agent");
      return { userId: "user-1", viaApiKey: true };
    },
    body: async () => {
      calls.push("body");
      return { name: "Groceries" };
    },
    optionalBody: async () => {
      calls.push("optionalBody");
      return {};
    },
    expire: (userId) => {
      calls.push(`expire:${userId}`);
    },
    ...overrides,
  };
  return { runtime, calls };
}

const post = (body: unknown) => new Request("https://khata.example/api/thing", { method: "POST", body: JSON.stringify(body) });

test("identity is resolved before the body is read, and only for routes that need it", async () => {
  const { runtime, calls } = stub();
  const handlers = defineRoute()(
    {
      GET: { auth: "public", handle: () => new Response(null, { status: 204 }) },
      POST: { body: z.object({ name: z.string() }), handle: () => new Response(null, { status: 204 }) },
    },
    { runtime },
  );

  await handlers.GET!(new Request("https://khata.example/api/thing"));
  assert.deepEqual(calls, ["begin"], "a public read asks nobody who they are, and reads no body");

  calls.length = 0;
  await handlers.POST!(post({ name: "Groceries" }));
  assert.deepEqual(calls, ["begin", "session", "body", "expire:user-1"], "a session write proves identity first, then parses the body, then expires the snapshot it changed");
});

test("the dynamic marker runs before anything else, on every verb", async () => {
  const { runtime, calls } = stub();
  const { GET, POST } = defineRoute()(
    { GET: { handle: () => new Response(null, { status: 204 }) }, POST: { handle: () => new Response(null, { status: 204 }) } },
    { runtime },
  );
  await GET!(new Request("https://khata.example/api/thing"));
  await POST!(post({}));
  assert.deepEqual(calls, ["begin", "session", "begin", "session", "expire:user-1"]);
});

test("an agent route is told how the caller proved who they are", async () => {
  const { runtime } = stub();
  const { GET } = defineRoute()({ GET: { auth: "agent", handle: ({ viaApiKey, userId }) => Response.json({ userId, viaApiKey }) } }, { runtime });
  const response = await GET!(new Request("https://khata.example/api/thing"));
  assert.deepEqual(await response.json(), { userId: "user-1", viaApiKey: true });
});

test("an unauthenticated call is a 401 and the handler never runs", async () => {
  let reached = false;
  const { runtime } = stub({
    session: async () => {
      throw new UnauthorizedError();
    },
  });
  const { GET } = defineRoute()({ GET: { handle: () => { reached = true; return new Response(null, { status: 204 }); } } }, { runtime });
  const response = await GET!(new Request("https://khata.example/api/thing"));
  assert.equal(response.status, 401);
  assert.equal(reached, false);
});

test("a body that does not match is a 400 naming the field, in each audience's words", async () => {
  const schema = z.object({ amount: z.number() });
  const { runtime } = stub({ body: async () => ({ amount: "lots" }) });

  const browser = defineRoute()({ POST: { body: schema, handle: () => new Response(null, { status: 204 }) } }, { runtime });
  const browserResponse = await browser.POST!(post({ amount: "lots" }));
  assert.equal(browserResponse.status, 400);
  assert.deepEqual(await browserResponse.json(), { error: "Invalid input: expected number, received string" });

  const agent = defineAgentRoute()({ POST: { body: schema, handle: () => new Response(null, { status: 204 }) } }, { runtime });
  const agentResponse = await agent.POST!(post({ amount: "lots" }));
  assert.equal(agentResponse.status, 400);
  const agentBody = await agentResponse.json();
  assert.equal(agentBody.ok, false);
  assert.match(agentBody.error, /^amount: /, "a bot needs the field path, a toast does not");
});

test("the query string is parsed the same way, with coercion", async () => {
  const { runtime } = stub();
  const { GET } = defineRoute()({ GET: { query: z.object({ limit: z.coerce.number().int().max(50) }), handle: ({ query }) => Response.json(query) } }, { runtime });
  assert.deepEqual(await (await GET!(new Request("https://khata.example/api/thing?limit=5"))).json(), { limit: 5 });
  assert.equal((await GET!(new Request("https://khata.example/api/thing?limit=500"))).status, 400);
});

test("dynamic params arrive already resolved, typed by the route", async () => {
  const { runtime } = stub();
  const { PATCH } = defineRoute<{ id: string }>()({ PATCH: { handle: ({ params }) => Response.json(params) } }, { runtime });
  const response = await PATCH!(new Request("https://khata.example/api/thing/e42", { method: "PATCH" }), { params: Promise.resolve({ id: "e42" }) });
  assert.deepEqual(await response.json(), { id: "e42" });
});

test("an optional body treats a missing one as empty, so an empty POST still validates", async () => {
  const { runtime } = stub({ optionalBody: async () => ({}) });
  const { POST } = defineRoute()({ POST: { body: z.object({}).default({}), optionalBody: true, handle: () => Response.json({ ok: true }) } }, { runtime });
  const response = await POST!(new Request("https://khata.example/api/thing", { method: "POST" }));
  assert.equal(response.status, 200);
});

test("a raw body skips validation for payloads judged row by row", async () => {
  const { runtime } = stub({ body: async () => ({ transactions: [{ amount: "lots" }] }) });
  let seen: unknown;
  const { POST } = defineRoute()({ POST: { rawBody: true, handle: ({ body }) => { seen = body; return new Response(null, { status: 204 }); } } }, { runtime });
  assert.equal((await POST!(post({}))).status, 204);
  assert.deepEqual(seen, { transactions: [{ amount: "lots" }] });
});

test("a spent budget is a 429 that says when to come back, and the handler never runs", async () => {
  let reached = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  const { runtime } = stub();
  const { POST } = defineRoute()(
    { POST: { limit: { limiter, key: ({ userId }) => userId, message: (retryAfter) => `Too many. Try again in ${retryAfter} seconds.` }, handle: () => { reached += 1; return new Response(null, { status: 204 }); } } },
    { runtime },
  );
  assert.equal((await POST!(post({}))).status, 204);
  const limited = await POST!(post({}));
  assert.equal(limited.status, 429);
  assert.equal(Number(limited.headers.get("retry-after")), 60);
  assert.deepEqual(await limited.json(), { error: "Too many. Try again in 60 seconds." });
  assert.equal(reached, 1, "a refused request must not reach the handler");
});

test("a limit can be keyed on the caller rather than the account", async () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  const { runtime } = stub();
  const { GET } = defineAgentRoute()(
    { GET: { auth: "public", limit: { limiter, key: ({ request }) => request.headers.get("x-forwarded-for") ?? "unknown" }, handle: () => new Response(null, { status: 204 }) } },
    { runtime },
  );
  const from = (ip: string) => GET!(new Request("https://khata.example/api/thing", { headers: { "x-forwarded-for": ip } }));
  assert.equal((await from("203.0.113.7")).status, 204);
  assert.equal((await from("203.0.113.7")).status, 429);
  assert.equal((await from("198.51.100.2")).status, 204, "a different caller has its own budget");
});

test("a handler's throw becomes the right status, and the two envelopes differ only in shape", async () => {
  const { runtime } = stub();
  const boom = () => {
    throw new ConflictError("This expense changed since you opened it.");
  };
  const browser = defineRoute()({ POST: { handle: boom } }, { runtime });
  const response = await browser.POST!(post({}));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "This expense changed since you opened it." });

  const agent = defineAgentRoute()({ POST: { handle: boom } }, { runtime });
  const agentResponse = await agent.POST!(post({}));
  assert.equal(agentResponse.status, 409);
  assert.deepEqual(await agentResponse.json(), { ok: false, error: "This expense changed since you opened it." });
});

test("a write that lands expires the caller's cached snapshot, so it reads their own change back", async () => {
  const { runtime, calls } = stub();
  const { GET, POST, DELETE } = defineRoute()(
    {
      GET: { handle: () => Response.json({ ok: true }) },
      POST: { handle: () => Response.json({ ok: true }, { status: 201 }) },
      DELETE: { handle: () => new Response(null, { status: 204 }) },
    },
    { runtime },
  );

  await GET!(new Request("https://khata.example/api/thing"));
  await POST!(post({}));
  await DELETE!(new Request("https://khata.example/api/thing", { method: "DELETE" }));
  assert.deepEqual(calls.filter((call) => call.startsWith("expire")), ["expire:user-1", "expire:user-1"], "a read changes nothing, each write drops the snapshot");
});

test("a refused write leaves the cache alone, because the rows never moved", async () => {
  const { runtime, calls } = stub();
  const { POST } = defineRoute()({ POST: { handle: () => Response.json({ error: "nope" }, { status: 409 }) } }, { runtime });
  await POST!(post({}));
  assert.deepEqual(calls.filter((call) => call.startsWith("expire")), []);
});

test("a write that cannot move the ledger says so instead of throwing a good cache away", async () => {
  const { runtime, calls } = stub();
  const { POST } = defineRoute()({ POST: { snapshot: false, handle: () => new Response(null, { status: 204 }) } }, { runtime });
  await POST!(post({}));
  assert.deepEqual(calls.filter((call) => call.startsWith("expire")), []);
});

test("an anonymous write has nobody to expire", async () => {
  const { runtime, calls } = stub({ session: async () => "" });
  const { POST } = defineRoute()({ POST: { auth: "public", handle: () => new Response(null, { status: 204 }) } }, { runtime });
  await POST!(post({}));
  assert.deepEqual(calls.filter((call) => call.startsWith("expire")), []);
});

test("only the verbs a route declares are exported", () => {
  const { GET, POST } = defineRoute()({ GET: { handle: () => new Response(null) }, POST: { handle: () => new Response(null) } });
  assert.ok(GET && POST);
  assert.equal((GET as { PATCH?: unknown }).PATCH, undefined);
});
test("the budget is spent before the body is read, so a refused request costs nothing", async () => {
  const reads: string[] = [];
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  const { runtime } = stub({
    body: async () => {
      reads.push("body");
      return {};
    },
  });
  const { POST } = defineRoute()({ POST: { rawBody: true, limit: { limiter, key: ({ userId }) => userId }, handle: () => new Response(null, { status: 204 }) } }, { runtime });
  await POST!(post({}));
  assert.equal((await POST!(post({}))).status, 429);
  assert.deepEqual(reads, ["body"], "the second request was refused before a byte was parsed");
});

test("a schema may be built per request, so 'yesterday' is yesterday every time", async () => {
  let built = 0;
  const { runtime } = stub();
  const { POST } = defineRoute()({
    POST: {
      body: () => {
        built += 1;
        return z.object({ date: z.string() });
      },
      handle: () => new Response(null, { status: 204 }),
    },
  }, { runtime });
  await POST!(post({ date: "2026-01-01" }));
  await POST!(post({ date: "2026-01-02" }));
  // Evaluating the schema once at module load would freeze "today" until restart.
  assert.equal(built, 2);
});

test("a refusal can carry the full answer at the top level of its body", async () => {
  const { runtime } = stub({ body: async () => ({ nope: true }) });
  const { POST } = defineRoute()({ POST: { rawBody: true, handle: () => { throw new ReportError("No rows could be imported.", { created: 0, updated: 0, invalid: [{ index: 0, message: "Date must be YYYY-MM-DD" }] }); } } }, { runtime });
  const response = await POST!(post({}));
  assert.equal(response.status, 400);
  // The import dialog reads these counts straight off the body.
  assert.deepEqual(await response.json(), {
    error: "No rows could be imported.",
    created: 0,
    updated: 0,
    invalid: [{ index: 0, message: "Date must be YYYY-MM-DD" }],
  });
});
