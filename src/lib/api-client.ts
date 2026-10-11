"use client";

/**
 * Shared browser-side fetch helpers.
 *
 * These lived as private copies inside `push-client.ts`, `notifications-card.tsx`, and
 * the notifications provider. Three near-identical `readError` implementations meant a
 * fix to one (a 204 with no body, a proxy returning HTML) silently left the other two
 * wrong, so they live here once.
 */

/** Largest gap a browser call is left to hang before it is treated as failed. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Reject rather than hang. A stalled fetch from a flaky connection would otherwise
 * leave a spinner or an optimistic update applied forever.
 */
export function withTimeout<T>(promise: Promise<T>, milliseconds = DEFAULT_TIMEOUT_MS, message = "Khata took too long to respond. Try again."): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * The server's error message, or `fallback` when the body is not the JSON we expect.
 * Every route answers failures as `{ error }`, but a proxy or a crash can return
 * something else entirely, and surfacing raw HTML to a person is worse than a bland line.
 */
export async function apiError(response: Response, fallback: string): Promise<string> {
  try {
    const value = (await response.json()) as { error?: unknown };
    return typeof value.error === "string" && value.error ? value.error : fallback;
  } catch {
    return fallback;
  }
}

/**
 * An error that knows which response produced it, so callers can branch on the status.
 * `body` is the parsed JSON when the server sent one, which matters for routes that answer a
 * rejected request with a report rather than a message — an import that lists which rows it
 * refused is a 400 the caller needs to render, not just report.
 */
export class ApiError extends Error {
  readonly body: unknown;

  constructor(
    message: string,
    readonly status: number,
    body: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.body = body;
  }
}

/** `fetch` to a Khata route, JSON in and JSON out, with a timeout and a usable error. */
export async function requestJson<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await withTimeout(
    fetch(path, {
      ...rest,
      headers: { accept: "application/json", ...(json === undefined ? {} : { "content-type": "application/json" }), ...headers },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    }),
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const server = (body as { error?: unknown } | null)?.error;
    const message = typeof server === "string" && server ? server : `Khata could not reach ${path.replace("/api/", "")}.`;
    throw new ApiError(message, response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
