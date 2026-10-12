import type { z } from "zod";
import { agentError } from "@/server/agent-http";
import { expireSnapshot } from "@/server/cache-tags";
import { RateLimitError, ValidationError, type Audience } from "@/server/errors";
import { jsonError } from "@/server/http";
import type { RateLimiter } from "@/server/request-guard";
import { agentIssue, plainIssue } from "@/server/validation";

/**
 * The HTTP edge, declared instead of repeated.
 *
 * Every route used to open with the same four moves — opt out of prerendering,
 * prove who the caller is, validate the body, and turn any throw into a
 * response — and every one of them got a detail wrong somewhere: a route that
 * forgot `beginRequest()`, a validation message phrased for bots shown to a
 * browser, a `ConflictError` that reached the agent API and became a 500.
 *
 * Here those four moves are written once. A route file now says what it needs —
 * who may call it, what shape the input must have, what the budget is — and the
 * combinator guarantees they happen, in that order, every time. A fifth grew out
 * of that: a successful write expires the caller's cached snapshot, so the ledger
 * a route just changed cannot be replayed from cache to the person who changed it.
 */

export type RouteParams = Record<string, string>;

/** Everything a handler is allowed to touch. No direct database, no ambient session. */
export type RequestContext<P extends RouteParams, Q, B> = {
  request: Request;
  /** Resolved dynamic segments, e.g. `{ id }`. */
  params: P;
  url: URL;
  /** The signed-in account. Empty string on a public route. */
  userId: string;
  /** True when `/api/v1` proved identity with an API key rather than a session. */
  viaApiKey: boolean;
  /** Parsed query string. `undefined` unless the route declares `query`. */
  query: Q;
  /** Parsed JSON body. `undefined` unless the route declares `body`. */
  body: B;
};

/** The per-request collaborators, injected so the combinator can be tested without a database. */
export type RouteRuntime = {
  begin(): Promise<void>;
  session(request: Request): Promise<string>;
  agent(request: Request): Promise<{ userId: string; viaApiKey: boolean }>;
  body(request: Request): Promise<unknown>;
  optionalBody(request: Request): Promise<unknown>;
  /** Drop the caller's cached snapshot after a write lands. */
  expire(userId: string): void;
};

export type Method<P extends RouteParams, Q, B> = {
  /**
   * How the caller proves who they are.
   * `session` — the browser cookie (the default).
   * `agent` — a personal API key, falling back to a session.
   * `public` — anonymous. The caller still gets past CSRF and rate limits.
   */
  auth?: "session" | "agent" | "public";
  /**
   * A schema, or a factory for one. The factory form exists because some schemas
   * close over the current date — `"yesterday"` has to mean yesterday *in
   * Kathmandu* on this request, not on whichever day the module happened to be
   * imported, which is what a top-level `new Date()` would have frozen.
   */
  query?: z.ZodType<Q> | ((ctx: RequestContext<P, Q, B>) => z.ZodType<Q>);
  body?: z.ZodType<B> | ((ctx: RequestContext<P, Q, B>) => z.ZodType<B>);
  /** Treat a missing body as `{}`, so an empty POST can still validate. */
  optionalBody?: boolean;
  /**
   * Read and parse the JSON body without validating its shape. For the endpoints
   * whose payload is validated somewhere closer to the data — an import file
   * reports per-row problems instead of one verdict on the whole file.
   */
  rawBody?: boolean;
  limit?: {
    limiter: RateLimiter;
    /** Usually `userId`, but an anonymous endpoint can key on IP instead. */
    key: (ctx: Pick<RequestContext<RouteParams, unknown, unknown>, "userId" | "viaApiKey" | "request" | "params" | "url">) => string;
    message?: (retryAfter: number) => string;
  };
  /**
   * Set `false` on a write that cannot change the snapshot a signed-in screen is
   * rendered from — revoking a session, renaming an API key, editing push
   * preferences. Those endpoints still go through every other guarantee here; this
   * only says their write is not worth throwing a cached ledger away for.
   */
  snapshot?: boolean;
  handle: (ctx: RequestContext<P, Q, B>) => Response | Promise<Response>;
};

type RawHandler = (request: Request, context?: { params?: Promise<RouteParams> }) => Promise<Response>;

export type RouteHandlers = {
  GET?: RawHandler;
  POST?: RawHandler;
  PATCH?: RawHandler;
  DELETE?: RawHandler;
};

const VERBS = ["GET", "POST", "PATCH", "DELETE"] as const;

/** A route may declare its schema directly, or build one per request. */
function resolve<S>(schema: S | ((ctx: never) => S), ctx: unknown): S {
  return typeof schema === "function" ? (schema as (ctx: unknown) => S)(ctx) : schema;
}

/**
 * Loaded on demand rather than imported at module scope: `defineRoute` is pure
 * enough to unit test, and a test should not have to boot Better Auth and the
 * pg pool to exercise it.
 */
let defaultRuntime: Promise<RouteRuntime> | null = null;

function loadDefaultRuntime(): Promise<RouteRuntime> {
  defaultRuntime ??= (async () => {
    const [{ beginRequest, readJson, readOptionalJson }, { requireUserId, requireAgentIdentity }] = await Promise.all([import("@/server/http"), import("@/server/session")]);
    return {
      begin: beginRequest,
      session: requireUserId,
      agent: requireAgentIdentity,
      body: readJson,
      optionalBody: readOptionalJson,
      expire: expireSnapshot,
    };
  })();
  return defaultRuntime;
}

const MUTATING = new Set(["POST", "PATCH", "DELETE"]);

function build<P extends RouteParams, Q, B>(verb: string, method: Method<P, Q, B>, audience: Audience, runtime?: RouteRuntime): RawHandler {
  const auth = method.auth ?? "session";
  const expiresSnapshot = MUTATING.has(verb) && method.snapshot !== false;
  return async function handler(request: Request, context?: { params?: Promise<RouteParams> }) {
    const rt = runtime ?? (await loadDefaultRuntime());
    try {
      // First, always: this is what marks the route as dynamic. Before it, a
      // handler could be prerendered into a shell with no identity in it.
      await rt.begin();

      const url = new URL(request.url);
      const params = (context?.params ? await context.params : {}) as P;

      let userId = "";
      let viaApiKey = false;
      if (auth === "session") {
        userId = await rt.session(request);
      } else if (auth === "agent") {
        const identity = await rt.agent(request);
        userId = identity.userId;
        viaApiKey = identity.viaApiKey;
      }

      let query = undefined as Q;
      if (method.query) {
        const parsed = resolve(method.query, { request, params, url, userId, viaApiKey }).safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) throw new ValidationError(audience === "agent" ? agentIssue(parsed.error) : plainIssue(parsed.error));
        query = parsed.data;
      }

      // Spend the budget before reading anything: a caller over their limit should
      // not get a megabyte buffered and parsed on the way to being refused.
      if (method.limit) {
        const key = method.limit.key({ request, params, url, userId, viaApiKey });
        const taken = method.limit.limiter.take(key);
        if (!taken.ok) {
          throw new RateLimitError(method.limit.message?.(taken.retryAfter) ?? `Too many attempts. Try again in ${taken.retryAfter} seconds.`, taken.retryAfter);
        }
      }

      let body = undefined as B;
      if (method.rawBody) {
        body = (method.optionalBody ? await rt.optionalBody(request) : await rt.body(request)) as B;
      } else if (method.body) {
        const raw = method.optionalBody ? await rt.optionalBody(request) : await rt.body(request);
        const parsed = resolve(method.body, { request, params, url, userId, viaApiKey }).safeParse(raw);
        if (!parsed.success) throw new ValidationError(audience === "agent" ? agentIssue(parsed.error) : plainIssue(parsed.error));
        body = parsed.data;
      }

      const response = await method.handle({ request, params, url, userId, viaApiKey, query, body });

      // Only a write that actually landed may expire anything: a rejected body
      // left the rows exactly as they were, and expiring on the strength of an
      // attempt would throw away a good cache entry for nothing.
      if (expiresSnapshot && response.status < 400 && userId) rt.expire(userId);

      return response;
    } catch (error) {
      return audience === "agent" ? agentError(error) : jsonError(error);
    }
  };
}

export type RouteOptions = {
  /** Only the tests pass this. */
  runtime?: RouteRuntime;
};

/**
 * Fixed when the caller says so (`Q`, `B` default to `never` = "infer from the
 * schemas"), which is what lets one route hold two verbs with different bodies.
 */
type Definition<P extends RouteParams, Q = never, B = never> = <InferredQ, InferredB>(
  methods: Partial<Record<(typeof VERBS)[number], Method<P, [Q] extends [never] ? InferredQ : Q, [B] extends [never] ? InferredB : B>>>,
  options?: RouteOptions,
) => RouteHandlers;

function definitionFor(audience: Audience): Definition<RouteParams> {
  return (methods, options) => {
    const handlers: RouteHandlers = {};
    for (const verb of VERBS) {
      const method = methods[verb];
      if (method) handlers[verb] = build(verb, method as Method<RouteParams, unknown, unknown>, audience, options?.runtime);
    }
    return handlers;
  };
}

/**
 * A route on the browser API: errors come back as `{ error }`.
 *
 * Curried so `Q` and `B` stay inferred from the schemas while a route with
 * dynamic segments can still name its params: `defineRoute<{ id: string }>()(…)`.
 */
export function defineRoute<P extends RouteParams = RouteParams, Q = never, B = never>(): Definition<P, Q, B> {
  return definitionFor("app") as unknown as Definition<P, Q, B>;
}

/** A route on the agent API: every answer is `{ ok, message | error, data }`. */
export function defineAgentRoute<P extends RouteParams = RouteParams, Q = never, B = never>(): Definition<P, Q, B> {
  return definitionFor("agent") as unknown as Definition<P, Q, B>;
}