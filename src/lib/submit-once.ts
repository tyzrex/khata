/**
 * One idempotency key per submission, however many times the same form is sent.
 *
 * A double-click, a second tap on a slow connection, or a retry after the response was
 * lost all send the same payload. Each of those must add one entry, not two. While a
 * submission is in flight, an identical one gets the same promise back; and until a
 * submission succeeds, retrying the same payload reuses its key, so the server can tell
 * "you already did this" from "this is a new entry". Once it succeeds the key is
 * dropped, so entering the same amount again on purpose is a new entry.
 */

type Submission = { key: string; inflight?: Promise<unknown> };

const MAX_TRACKED = 50;
const submissions = new Map<string, Submission>();

export function submitOnce<T>(scope: string, payload: unknown, send: (idempotencyKey: string) => Promise<T>): Promise<T> {
  const id = `${scope}:${JSON.stringify(payload)}`;
  const existing = submissions.get(id);
  if (existing?.inflight) return existing.inflight as Promise<T>;

  const submission = existing ?? { key: crypto.randomUUID() };
  if (!existing) {
    // Failed submissions keep their key for a retry; do not let them pile up forever.
    if (submissions.size >= MAX_TRACKED) submissions.delete(submissions.keys().next().value!);
    submissions.set(id, submission);
  }

  const inflight = send(submission.key).then(
    (result) => {
      submissions.delete(id);
      return result;
    },
    (error: unknown) => {
      submission.inflight = undefined;
      throw error;
    },
  );
  submission.inflight = inflight;
  return inflight;
}

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
