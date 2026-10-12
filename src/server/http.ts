import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { AppError, RequestError, toFailure, type Failure } from "@/server/errors";

export { RequestError } from "@/server/errors";

/**
 * A refusal whose body carries the full answer.
 *
 * Import is the case that needs it: a file where every row was refused still
 * reports which rows and why, and the caller reads those counts straight off the
 * body. `details` would nest them one level down and change the contract.
 */
export class ReportError extends AppError {
  constructor(
    message: string,
    readonly report: Record<string, unknown>,
  ) {
    super(message, 400);
  }
}

/**
 * The browser-facing transport. It decides nothing: `toFailure` has already
 * decided the status and the wording by the time anything reaches here. All this
 * layer adds is JSON.
 */

/** Largest JSON body any route accepts. Imports cap at 500 rows, well under this. */
export const MAX_JSON_BYTES = 1_000_000;

/**
 * Opt out of prerendering for this request. Every handler awaits it before it
 * touches the session or the database, so a route can never be cached as a shell
 * that was built without an identity.
 */
export async function beginRequest() {
  await connection();
}

/** Reads the body, giving up as soon as it passes the cap instead of buffering a chunked upload whole. */
async function readCappedText(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_JSON_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new RequestError("That request is too large.", 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Parse a JSON body with a size cap. Malformed JSON is a 400, not a 500, and an
 * oversized body is refused before it is buffered when Content-Length says so.
 */
export async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw new RequestError("That request is too large.", 413);
  const text = await readCappedText(request);
  if (!text.trim()) throw new RequestError("Send a JSON body.", 400);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestError("That body is not JSON.", 400);
  }
}

/** Some endpoints (creating a shareable link) accept an empty POST. */
export async function readOptionalJson(request: Request): Promise<unknown> {
  try {
    return await readJson(request);
  } catch (error) {
    if (error instanceof RequestError && error.status === 400 && error.message === "Send a JSON body.") return {};
    throw error;
  }
}

/** Success with nothing to say. Used by every delete that removed a row. */
export function noContent() {
  return new Response(null, { status: 204 });
}

function render(failure: Failure, spread?: Record<string, unknown>) {
  const body = spread ? { error: failure.error, ...spread } : failure.details === undefined ? { error: failure.error } : { error: failure.error, details: failure.details };
  const headers = failure.retryAfter ? { "retry-after": String(failure.retryAfter) } : undefined;
  return Response.json(body, { status: failure.status, headers });
}

/**
 * The one error funnel for every `/api` route. `unstable_rethrow` comes first so
 * Next's own control-flow signals — redirect(), notFound() — still work through
 * a route's try/catch.
 */
export function jsonError(error: unknown) {
  unstable_rethrow(error);
  const failure = toFailure(error, "app");
  const spread = error instanceof ReportError ? error.report : undefined;
  // Only genuine surprises get logged; a 404 or a rejected body is normal traffic.
  if (failure.status >= 500) console.error(error);
  return render(failure, spread);
}