/**
 * The one place a thrown value becomes a status code.
 *
 * Every layer below the routes — repositories, services, Better Auth hooks —
 * signals failure by throwing. Each transport renders the result; neither decides
 * what it means. That is the whole point of this module: `toFailure` is the only
 * mapping from an error to a status, so the browser API and the agent API can
 * never drift apart on what a conflict is, and a bug like an unmapped
 * `ConflictError` (which used to surface as a 500 to bots) cannot recur.
 *
 * Deliberately free of `next/*` imports so it can be unit tested on its own.
 * The renderers live in `./http` and `./agent-http`.
 */

import { AgentInputError } from "@/server/agent/match";
import { ImportShapeError } from "@/lib/schemas";
import { ShareInputError } from "@/lib/split";

/** Which API is asking. Both share one mapping; only the wording differs. */
export type Audience = "app" | "agent";

export type Failure = {
  status: number;
  error: string;
  /** Extra body fields: `details`, `hint`, `candidates`. */
  details?: unknown;
  hint?: string;
  candidates?: string[];
  /** Seconds to wait, set only by `RateLimitError`. */
  retryAfter?: number;
};

/** Base class for failures that already know their status. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly extra: Omit<Failure, "status" | "error" | "retryAfter"> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super("Sign in required.", 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

/** A client mistake that maps straight to a status with a safe message. */
export class RequestError extends AppError {
  constructor(
    message: string,
    status: number,
  ) {
    super(message, status);
  }
}

/** Authenticated, but not allowed to touch this. */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403);
  }
}

/** Body or query did not satisfy the contract. */
export class ValidationError extends AppError {
  constructor(
    message: string,
    details?: unknown,
  ) {
    super(message, 400, details === undefined ? {} : { details });
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string,
    readonly retryAfter: number,
  ) {
    super(message, 429);
  }
}

const AUTH_HINT = "Create a key in Khata → Settings → API keys and send it as `Authorization: Bearer khata_...` or `X-API-Key: khata_...`.";

/** The agent API talks to key holders, not browsers, so a 401 explains the key. */
export function unauthorizedFailure(audience: Audience): Failure {
  if (audience === "app") return { status: 401, error: "Sign in required." };
  return { status: 401, error: "Missing or invalid API key.", hint: AUTH_HINT };
}

/** Postgres error code, digging through `cause` chains from pooled drivers. */
export function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return pgCode(error.cause);
  return undefined;
}

export function isUniqueViolation(error: unknown) {
  return pgCode(error) === "23505";
}

/**
 * Infrastructure trouble rather than a bad request: a missing pool, a database
 * that is down, or tables that have not been migrated yet.
 */
function isUnavailable(error: unknown, message: string) {
  if (!process.env.DATABASE_URL || message.includes("DATABASE_URL is not set")) return true;
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|password authentication|timeout|does not exist/i.test(message);
}

function unavailable(audience: Audience): Failure {
  // Setup hints help locally; in production they would describe the infrastructure
  // to anyone who triggered an outage.
  if (audience === "app" && process.env.NODE_ENV !== "production") {
    return {
      status: 503,
      error: !process.env.DATABASE_URL
        ? "DATABASE_URL is not set. Add the Neon pooled connection string, then restart."
        : "Postgres is unreachable, or the Khata tables are missing. Check DATABASE_URL and run bun run db:migrate.",
    };
  }
  return { status: 503, error: "Khata is unavailable right now. Try again shortly." };
}

/**
 * The single error → status mapping. Anything not recognised here is a bug, so it
 * becomes an opaque 500 rather than leaking the underlying message.
 */
export function toFailure(error: unknown, audience: Audience = "app"): Failure {
  if (error instanceof UnauthorizedError) return unauthorizedFailure(audience);
  if (error instanceof AppError) {
    return { status: error.status, error: error.message, ...error.extra, ...(error instanceof RateLimitError ? { retryAfter: error.retryAfter } : {}) };
  }
  // Domain errors carry their own wording, which is written for people and stays
  // the same on both transports.
  if (error instanceof AgentInputError) {
    return { status: error.status, error: error.message, ...(error.candidates.length ? { candidates: error.candidates } : {}) };
  }
  if (error instanceof ShareInputError || error instanceof ImportShapeError) {
    return { status: 400, error: error.message };
  }
  // Two writes raced past the application checks and hit a unique constraint (a
  // bank line linked twice, a person added twice). The database kept it
  // consistent; the client just needs to re-read.
  if (isUniqueViolation(error)) {
    return { status: 409, error: "That was just changed elsewhere. Refresh and try again." };
  }
  const message = error instanceof Error ? error.message : "";
  if (isUnavailable(error, message)) return unavailable(audience);
  if (audience === "agent") return { status: 500, error: "Khata could not do that just now. Try again shortly." };
  return { status: 500, error: "The ledger could not be read just now." };
}