import { unstable_rethrow } from "next/navigation";
import { NotFoundError } from "@/db/shares";
import { RequestError, UnauthorizedError } from "@/lib/http";
import { AgentInputError } from "@/lib/agent/match";
import { limits } from "@/lib/request-guard";
import { ImportShapeError } from "@/lib/schemas";
import { ShareInputError } from "@/lib/split";
import type { z } from "zod";

/**
 * One envelope for every /api/v1 answer, so a bot can branch on `ok` and read
 * `message` (success) or `error` (failure) aloud without knowing the endpoint.
 */

export function ok<T>(data: T, message: string, status = 200) {
  return Response.json({ ok: true, message, data }, { status });
}

export function fail(error: string, status = 400, extra: { candidates?: string[]; hint?: string; details?: unknown } = {}) {
  return Response.json({ ok: false, error, ...extra }, { status });
}

/** First zod issue as "field: message", which tells a bot exactly what to change. */
export function zodMessage(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Invalid request.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Counts one write against the per-user agent budget; returns a 429 response when spent. */
export function spendWrite(userId: string) {
  const limit = limits.agentWrites.take(userId);
  if (limit.ok) return null;
  return Response.json(
    { ok: false, error: `Too many writes. Try again in ${limit.retryAfter} seconds.` },
    { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
  );
}

const AUTH_HINT = "Create a key in Khata → Settings → API keys and send it as `Authorization: Bearer khata_...` or `X-API-Key: khata_...`.";

export function agentError(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AgentInputError) return fail(error.message, error.status, error.candidates.length ? { candidates: error.candidates } : {});
  if (error instanceof ShareInputError || error instanceof ImportShapeError) return fail(error.message, 400);
  if (error instanceof NotFoundError) return fail(error.message, 404);
  if (error instanceof UnauthorizedError) return fail("Missing or invalid API key.", 401, { hint: AUTH_HINT });
  if (error instanceof RequestError) return fail(error.message, error.status);
  const code = pgCode(error);
  if (code === "23505") return fail("That was just changed elsewhere. Fetch it again and retry.", 409);
  console.error(error);
  const message = error instanceof Error ? error.message : "";
  if (/DATABASE_URL|ECONNREFUSED|ENOTFOUND|timeout|does not exist/i.test(message)) return fail("Khata is unavailable right now. Try again shortly.", 503);
  return fail("Khata could not do that just now. Try again shortly.", 500);
}

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return pgCode(error.cause);
  return undefined;
}
