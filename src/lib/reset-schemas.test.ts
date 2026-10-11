import assert from "node:assert/strict";
import test from "node:test";
import { forgotPasswordSchema, resetPasswordSchema } from "./reset-schemas";

test("the reset form needs a long-enough password typed twice", () => {
  assert.equal(resetPasswordSchema.safeParse({ password: "short", confirm: "short" }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ password: "longenough1", confirm: "different1" }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ password: "longenough1", confirm: "longenough1" }).success, true);
  // The floor matches auth.ts, so the form never accepts what the server would reject.
  assert.equal(resetPasswordSchema.safeParse({ password: "1234567", confirm: "1234567" }).success, false);
});

test("the request form wants an address that looks like one", () => {
  assert.equal(forgotPasswordSchema.safeParse({ email: "asha@example.com" }).success, true);
  assert.equal(forgotPasswordSchema.safeParse({ email: "not-an-address" }).success, false);
});
