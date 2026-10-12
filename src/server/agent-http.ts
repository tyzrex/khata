import { unstable_rethrow } from "next/navigation";
import { toFailure, type Failure } from "@/server/errors";

/**
 * The agent API's transport.
 *
 * Same status decisions as `@/server/http` — both read `toFailure` — wrapped in
 * one envelope so a bot can branch on `ok` and read `message` (success) or
 * `error` (failure) aloud without knowing which endpoint it called.
 */

export function ok<T>(data: T, message: string, status = 200) {
  return Response.json({ ok: true, message, data }, { status });
}

export function fail(error: string, status = 400, extra: { candidates?: string[]; hint?: string; details?: unknown } = {}) {
  return Response.json({ ok: false, error, ...extra }, { status });
}

function render(failure: Failure) {
  const { status, error, retryAfter, ...extra } = failure;
  return Response.json(
    { ok: false, error, ...extra },
    { status, headers: retryAfter ? { "retry-after": String(retryAfter) } : undefined },
  );
}

export function agentError(error: unknown) {
  unstable_rethrow(error);
  const failure = toFailure(error, "agent");
  if (failure.status >= 500) console.error(error);
  return render(failure);
}