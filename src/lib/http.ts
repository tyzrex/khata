import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { ConflictError, NotFoundError } from "@/db/shares";
import { ShareInputError } from "@/lib/split";

/** Largest JSON body any route accepts. Imports cap at 500 rows, well under this. */
export const MAX_JSON_BYTES = 1_000_000;

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in required.");
    this.name = "UnauthorizedError";
  }
}

/** A client mistake that maps straight to a status code with a safe message. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export async function beginRequest() {
  await connection();
}

/**
 * Parse a JSON body with a size cap. Malformed JSON is a 400, not a 500, and an
 * oversized body is refused before it is buffered when Content-Length says so.
 */
export async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw new RequestError("That request is too large.", 413);
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new RequestError("That request is too large.", 413);
  if (!text.trim()) throw new RequestError("Send a JSON body.", 400);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestError("That body is not JSON.", 400);
  }
}

export function badRequest(message: string, details?: unknown) {
  return Response.json(details === undefined ? { error: message } : { error: message, details }, { status: 400 });
}

export function tooManyRequests(retryAfter: number) {
  return Response.json({ error: "Too many attempts. Try again in a little while." }, { status: 429, headers: { "retry-after": String(retryAfter) } });
}

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return pgCode(error.cause);
  return undefined;
}

export function shareError(error: unknown) {
  if (error instanceof ShareInputError) return badRequest(error.message);
  if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof ConflictError) return Response.json({ error: error.message }, { status: 409 });
  // Two writes raced past the application checks and hit a unique constraint (a bank
  // line linked twice, a person added twice). The database kept it consistent.
  if (pgCode(error) === "23505") return Response.json({ error: "That was just changed elsewhere. Refresh and try again." }, { status: 409 });
  return jsonError(error);
}

export function jsonError(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  if (error instanceof RequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "";
  const unavailable = !process.env.DATABASE_URL || message.includes("DATABASE_URL is not set") || /ECONNREFUSED|ENOTFOUND|password authentication|timeout|does not exist/i.test(message);
  if (unavailable) {
    // Setup hints help locally; in production they would describe the infrastructure to anyone.
    if (process.env.NODE_ENV === "production") {
      return Response.json({ error: "Khata is unavailable right now. Try again shortly." }, { status: 503 });
    }
    return Response.json(
      {
        error: !process.env.DATABASE_URL || message.includes("DATABASE_URL is not set")
          ? "DATABASE_URL is not set. Add the Neon pooled connection string, then restart."
          : "Postgres is unreachable, or the Khata tables are missing. Check DATABASE_URL and run bun run db:migrate.",
      },
      { status: 503 },
    );
  }
  return Response.json({ error: "The ledger could not be read just now." }, { status: 500 });
}
