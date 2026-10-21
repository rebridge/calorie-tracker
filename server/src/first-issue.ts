import type { ZodError } from "zod";

/** The first validation problem as "field: message", for a readable 400. */
export function firstIssue(error: ZodError) {
  const issue = error.issues[0]!;
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}
