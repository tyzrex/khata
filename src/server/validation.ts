import type { z } from "zod";

/**
 * One zod issue, phrased for the caller.
 *
 * The two audiences need different things. A browser shows the message in a
 * toast, where "Name is required" reads better than "name: Name is required". A
 * bot reads the field path so it knows which key to change. Both come from the
 * same issue, so a schema cannot fix one phrasing and leave the other wrong.
 */
export function plainIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid value";
}

export function agentIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}