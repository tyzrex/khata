import assert from "node:assert/strict";
import test from "node:test";
import { ConflictError, NotFoundError, RequestError, RateLimitError, UnauthorizedError, ValidationError, isUniqueViolation, toFailure } from "@/server/errors";
import { AgentInputError } from "@/server/agent/match";
import { ImportShapeError } from "@/lib/schemas";
import { ShareInputError } from "@/lib/split";

/**
 * `toFailure` is the only place an error becomes a status, so these tests are
 * about the mapping itself rather than about any one endpoint.
 */

/** Infrastructure detection keys off DATABASE_URL, so most tests need one. */
function withDatabaseUrl(run: () => void) {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://khata:test@localhost:5432/khata";
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

test("every domain error has a status and keeps the message a person wrote", () => {
  assert.deepEqual(toFailure(new NotFoundError("That person is not in the book.")), { status: 404, error: "That person is not in the book." });
  assert.deepEqual(toFailure(new ConflictError("This expense changed since you opened it.")), { status: 409, error: "This expense changed since you opened it." });
  assert.deepEqual(toFailure(new ValidationError("Name is required")), { status: 400, error: "Name is required" });
  assert.deepEqual(toFailure(new RequestError("That request is too large.", 413)), { status: 413, error: "That request is too large." });
  assert.deepEqual(toFailure(new ShareInputError("Nobody is left to share this expense.")), { status: 400, error: "Nobody is left to share this expense." });
  assert.deepEqual(toFailure(new ImportShapeError('Send { "transactions": [ ... ] }.')), { status: 400, error: 'Send { "transactions": [ ... ] }.' });
});

test("a ConflictError is a 409 on the agent API too, not an unexplained 500", () => {
  // The bug this guards against: the two renderers used to have their own error
  // lists, and ConflictError was missing from the agent one.
  assert.equal(toFailure(new ConflictError("stale"), "agent").status, 409);
  assert.equal(toFailure(new NotFoundError("gone"), "agent").status, 404);
});

test("both audiences agree on the status and differ only in how they explain a 401", () => {
  const browser = toFailure(new UnauthorizedError(), "app");
  const agent = toFailure(new UnauthorizedError(), "agent");
  assert.equal(browser.status, 401);
  assert.equal(agent.status, 401);
  assert.equal(browser.error, "Sign in required.");
  assert.match(agent.error, /API key/);
  assert.match(String(agent.hint), /X-API-Key/);
});

test("an ambiguous agent input carries the candidates that resolve it", () => {
  const failure = toFailure(new AgentInputError("Two friends are called Anita.", ["Anita Rai", "Anita Shrestha"]), "agent");
  assert.deepEqual(failure, { status: 400, error: "Two friends are called Anita.", candidates: ["Anita Rai", "Anita Shrestha"] });
  // With nothing to suggest, the field is omitted rather than sent empty.
  assert.deepEqual(toFailure(new AgentInputError("Unknown friend."), "agent"), { status: 400, error: "Unknown friend." });
});

test("a unique-constraint violation is a 409, not a crash", () => {
  const race = Object.assign(new Error("duplicate key value"), { code: "23505" });
  assert.equal(toFailure(race).status, 409);
  assert.equal(isUniqueViolation(race), true);
  assert.equal(isUniqueViolation(Object.assign(new Error("wrapped"), { cause: race })), true, "the code is read through cause");
  assert.equal(isUniqueViolation(new Error("unrelated")), false);
});

test("a rate limit reports how long to wait", () => {
  const failure = toFailure(new RateLimitError("Too many writes. Try again in 42 seconds.", 42));
  assert.equal(failure.status, 429);
  assert.equal(failure.retryAfter, 42);
});

test("infrastructure trouble is a 503, and says so usefully in development", () => {
  withDatabaseUrl(() => {
    assert.equal(toFailure(new Error("connect ECONNREFUSED 10.0.0.1:5432")).status, 503);
    assert.match(toFailure(new Error("DATABASE_URL is not set")).error, /DATABASE_URL/);
  });
  delete process.env.DATABASE_URL;
  assert.equal(toFailure(new Error("anything at all")).status, 503, "no pool configured means nothing can work");
});

test("an unrecognised throw becomes an opaque 500", () => {
  withDatabaseUrl(() => {
    const failure = toFailure(new Error("Cannot read properties of undefined (reading 'id')"));
    assert.equal(failure.status, 500);
    assert.doesNotMatch(failure.error, /Cannot read properties/);
  });
});

test("validation details survive when there are any", () => {
  const invalid = [{ index: 3, error: "amount: Not a number" }];
  assert.deepEqual(toFailure(new ValidationError("No rows could be imported.", invalid)), { status: 400, error: "No rows could be imported.", details: invalid });
});