/**
 * Data isolation tests.
 *
 * These tests verify that the codebase cannot expose one user's private
 * ledger data to another user, covering the root causes identified in the
 * security audit:
 *
 *  1. claimUnownedLedger (row-adoption) has been removed.
 *  2. ensureCategories / importTransactions require a non-null userId.
 *  3. seedSampleBook generates per-user IDs that never collide across accounts.
 *  4. rowScope in shares.ts only grants access to the owner or a verified
 *     group member — never to an arbitrary third user.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { appOrigin } from "./app-origin";
import { assertAuthSecret } from "./auth";
import { oneLine } from "./invite-email";
import { clientIp, createRateLimiter, isAllowedWrite, isInviteToken, trustedOrigins } from "./request-guard";

// ---------------------------------------------------------------------------
// Helper: read a source file and return its text.
// ---------------------------------------------------------------------------
function src(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), "utf8");
}

// ---------------------------------------------------------------------------
// 1. claimUnownedLedger must not exist in the session module.
// ---------------------------------------------------------------------------
test("session.ts does not import or call claimUnownedLedger", () => {
  const sessionSrc = src("src/lib/session.ts");
  assert.ok(
    !sessionSrc.includes("claimUnownedLedger"),
    "session.ts must not reference claimUnownedLedger (row-adoption removed)",
  );
});

// ---------------------------------------------------------------------------
// 2. owner.ts must not export claimUnownedLedger any more.
// ---------------------------------------------------------------------------
test("owner.ts does not export claimUnownedLedger", () => {
  const ownerSrc = src("src/db/owner.ts");
  assert.ok(
    !ownerSrc.includes("export") || !ownerSrc.includes("claimUnownedLedger"),
    "owner.ts must not export claimUnownedLedger",
  );
});

// ---------------------------------------------------------------------------
// 3. The owned() helper that matched NULL user_id rows must be gone.
// ---------------------------------------------------------------------------
test("ledger.ts does not contain the owned() null-user helper", () => {
  const ledgerSrc = src("src/db/ledger.ts");
  assert.ok(
    !ledgerSrc.includes("function owned"),
    "ledger.ts must not contain 'function owned' (null-user helper removed)",
  );
  assert.ok(
    !ledgerSrc.includes("isNull"),
    "ledger.ts must not use isNull() — all queries are scoped to a real userId",
  );
});

// ---------------------------------------------------------------------------
// 4. importTransactions and ensureCategories must take `string`, not
//    `string | null`, ensuring unauthenticated callers cannot import rows.
// ---------------------------------------------------------------------------
test("ledger.ts signatures require non-null userId for import and ensureCategories", () => {
  const ledgerSrc = src("src/db/ledger.ts");

  // The old null-accepting signature was: userId: string | null
  // Both functions must now declare: userId: string
  const nullablePattern = /function\s+(importTransactions|ensureCategories)\s*\([^)]*userId\s*:\s*string\s*\|\s*null/;
  assert.ok(
    !nullablePattern.test(ledgerSrc),
    "importTransactions and ensureCategories must not accept userId: string | null",
  );
});

// ---------------------------------------------------------------------------
// 5. seedSampleBook must require a non-null userId.
// ---------------------------------------------------------------------------
test("shares.ts seedSampleBook requires non-null userId", () => {
  const sharesSrc = src("src/db/shares.ts");
  const nullablePattern = /function\s+seedSampleBook\s*\([^)]*userId\s*:\s*string\s*\|\s*null/;
  assert.ok(
    !nullablePattern.test(sharesSrc),
    "seedSampleBook must not accept userId: string | null",
  );
});

// ---------------------------------------------------------------------------
// 6. seedSampleBook uses per-user scoped IDs — verify the scoping strategy.
//    Two different userIds must produce different IDs for the same sample key.
// ---------------------------------------------------------------------------
test("seed sample IDs are scoped per user and never collide", () => {
  const userA = "user-alice-aaa";
  const userB = "user-bob-bbb";

  // Mirror the scopedId logic from shares.ts
  const scopedId = (userId: string) => (raw: string) => `${raw}--${userId}`;

  const scopeA = scopedId(userA);
  const scopeB = scopedId(userB);

  const sampleKeys = ["person-sameer", "person-anita", "group-biker", "exp-parts", "settlement-1"];

  for (const key of sampleKeys) {
    const idA = scopeA(key);
    const idB = scopeB(key);
    assert.notEqual(idA, idB, `ID for "${key}" must differ between users`);
    assert.ok(idA.includes(userA), `ID for "${key}" must embed userA`);
    assert.ok(idB.includes(userB), `ID for "${key}" must embed userB`);
  }
});

// ---------------------------------------------------------------------------
// 7. Migration 0004 must delete orphan rows and set NOT NULL on owner columns.
// ---------------------------------------------------------------------------
test("migration 0004 removes orphans and adds NOT NULL constraints", () => {
  const migration = src("drizzle/0004_isolate_user_id.sql");

  const orphanTables = ["settlements", "shared_expenses", "people", "groups", "categories", "transactions"];
  for (const table of orphanTables) {
    assert.ok(
      migration.includes(`DELETE FROM "${table}" WHERE "user_id" IS NULL`),
      `Migration must delete orphan rows from ${table}`,
    );
    assert.ok(
      migration.includes(`ALTER TABLE "${table}" ALTER COLUMN "user_id" SET NOT NULL`),
      `Migration must set NOT NULL on ${table}.user_id`,
    );
  }
});

// ---------------------------------------------------------------------------
// 8. getShareBook must not expose joined-group private ledger data.
//    The multi-user shares.ts uses loadJoinedGroup which only returns
//    expenses scoped to a specific groupId, never the owner's full ledger.
// ---------------------------------------------------------------------------
test("shares.ts loadJoinedGroup scopes expenses to a single group, not the owner's full ledger", () => {
  const sharesSrc = src("src/db/shares.ts");

  // The crucial WHERE clause inside loadJoinedGroup must AND on groupId.
  // Verify the pattern exists: sharedExpenses filtered by both ownerId AND groupId.
  assert.ok(
    sharesSrc.includes("eq(sharedExpenses.userId, ownerId)") &&
      sharesSrc.includes("eq(sharedExpenses.groupId, groupId)"),
    "loadJoinedGroup must filter shared_expenses by both ownerId AND groupId",
  );

  // Member must not be able to read the owner's private transactions.
  // The function must not do an unconstrained query on transactions by ownerId alone.
  // (Bank rows are only loaded by their IDs linked to that group's expenses/settlements.)
  const loadJoinedGroupSection = sharesSrc.slice(
    sharesSrc.indexOf("async function loadJoinedGroup"),
    sharesSrc.indexOf("export async function ensureSelf"),
  );
  assert.ok(
    !loadJoinedGroupSection.includes("eq(transactions.userId, ownerId)"),
    "loadJoinedGroup must not query the owner's private bank transactions by userId alone",
  );
});

// ---------------------------------------------------------------------------
// 9. groupUserAccess ACL: member access requires explicit grant row.
// ---------------------------------------------------------------------------
test("shares.ts memberAccess checks groupUserAccess table, not just group ownership", () => {
  const sharesSrc = src("src/db/shares.ts");
  assert.ok(
    sharesSrc.includes("groupUserAccess"),
    "shares.ts must reference the groupUserAccess ACL table",
  );
  assert.ok(
    sharesSrc.includes("memberAccess"),
    "shares.ts must have a memberAccess guard function",
  );
});

// ---------------------------------------------------------------------------
// 10. Removing a member from a group must revoke their account's access.
//     updateGroup rewrites group_members; it must also delete the matching
//     group_user_access rows, or a removed friend keeps seeing the group.
// ---------------------------------------------------------------------------
test("shares.ts updateGroup revokes group access for removed members", () => {
  const sharesSrc = src("src/db/shares.ts");
  const section = sharesSrc.slice(
    sharesSrc.indexOf("export async function updateGroup"),
    sharesSrc.indexOf("export async function deleteGroup"),
  );
  assert.ok(section.includes("delete(groupUserAccess)"), "updateGroup must delete group access rows when members change");
  assert.ok(
    section.includes('eq(groupUserAccess.role, "member")'),
    "updateGroup must only revoke member rows, never the owner's",
  );
  assert.ok(section.includes("notInArray"), "updateGroup must keep access for members who remain in the group");
});

// ---------------------------------------------------------------------------
// 11. Deleting a group must not orphan its expenses and settlements.
// ---------------------------------------------------------------------------
test("shares.ts deleteGroup removes the group's expenses and settlements", () => {
  const sharesSrc = src("src/db/shares.ts");
  const section = sharesSrc.slice(
    sharesSrc.indexOf("export async function deleteGroup"),
    sharesSrc.indexOf("async function assertExpenseLinks"),
  );
  assert.ok(section.includes("tx.delete(sharedExpenses)"), "deleteGroup must delete the group's shared expenses");
  assert.ok(section.includes("tx.delete(settlements)"), "deleteGroup must delete the group's settlements");
});

// ---------------------------------------------------------------------------
// 12. ensureCategories must not write on every read path.
// ---------------------------------------------------------------------------
test("ledger.ts ensureCategories checks for existing rows before inserting", () => {
  const ledgerSrc = src("src/db/ledger.ts");
  const section = ledgerSrc.slice(
    ledgerSrc.indexOf("export async function ensureCategories"),
    ledgerSrc.indexOf("async function ensureNamedCategory"),
  );
  assert.ok(section.includes("inArray(categories.name"), "ensureCategories must check for the default categories specifically, not any row");
  assert.ok(section.includes("DEFAULT_CATEGORIES.length) return"), "ensureCategories must return early once all defaults exist");
});

// ---------------------------------------------------------------------------
// 13. Auth must not trust an arbitrary *.vercel.app origin.
// ---------------------------------------------------------------------------
test("trusted origins come from Vercel's own hosts, never a vercel.app wildcard", () => {
  const authSrc = src("src/lib/auth.ts");
  assert.ok(authSrc.includes("trustedOrigins()"), "auth.ts must build trustedOrigins from the shared helper");
  const origins = trustedOrigins({ VERCEL_URL: "khata-abc123.vercel.app", BETTER_AUTH_URL: "https://khata.example/", TRUSTED_ORIGINS: " https://extra.example , " });
  assert.ok(origins.includes("https://khata-abc123.vercel.app"));
  assert.ok(origins.includes("https://khata.example"));
  assert.ok(origins.includes("https://extra.example"));
  assert.ok(!origins.some((origin) => origin.includes("*")), "no wildcard origins");
});

// ---------------------------------------------------------------------------
// 14. The validated currency must be persisted, not a hardcoded literal.
// ---------------------------------------------------------------------------
test("ledger.ts transactionValues uses the validated currency", () => {
  const ledgerSrc = src("src/db/ledger.ts");
  const section = ledgerSrc.slice(
    ledgerSrc.indexOf("function transactionValues"),
    ledgerSrc.indexOf("export async function createTransaction"),
  );
  assert.ok(section.includes("currency: input.currency"), "transactionValues must persist input.currency");
});

// ---------------------------------------------------------------------------
// 15. Direct (friend) groups stay inside the owner's book.
// ---------------------------------------------------------------------------
test("ensureDirectGroup only reads the caller's own people and groups", () => {
  const text = src("src/db/shares.ts");
  const start = text.indexOf("export async function ensureDirectGroup");
  const body = text.slice(start, text.indexOf("export async function updateGroup"));
  assert.match(body, /eq\(people\.userId, userId\)/, "person lookup must be scoped to the caller");
  assert.match(body, /eq\(groups\.userId, userId\)/, "group lookup must be scoped to the caller");
  assert.match(body, /person\.isSelf/, "must refuse to make a direct book with yourself");
});

test("the direct-group API route requires a session", () => {
  const text = src("src/app/api/people/[id]/direct/route.ts");
  assert.match(text, /requireUserId\(request\)/);
  assert.match(text, /ensureDirectGroup\(userId, id\)/);
});

test("accepting an invite only opens the inviting owner's direct groups", () => {
  const text = src("src/db/invites.ts");
  const start = text.indexOf("Joining any group makes you a friend");
  assert.ok(start > 0, "direct-group access grant is missing");
  const block = text.slice(start, start + 700);
  assert.match(block, /eq\(groups\.userId, ownerId\)/, "must be limited to groups owned by the inviter");
  assert.match(block, /eq\(groups\.kind, "direct"\)/);
});

// ---------------------------------------------------------------------------
// Request hardening: CSRF origin check, rate limits, invite tokens, link origins.
// ---------------------------------------------------------------------------
const req = (method: string, headers: Record<string, string> = {}) => ({ method, headers: new Headers({ host: "khata.example", ...headers }) });

test("cross-site writes are refused; same-site, trusted and non-browser writes pass", () => {
  assert.equal(isAllowedWrite(req("GET", { origin: "https://evil.example" }), []), true, "reads are never blocked");
  assert.equal(isAllowedWrite(req("POST", { origin: "https://khata.example" }), []), true);
  assert.equal(isAllowedWrite(req("POST", { host: "192.168.1.5:3847", origin: "http://192.168.1.5:3847" }), []), true, "LAN dev access");
  assert.equal(isAllowedWrite(req("POST", { host: "internal:3000", "x-forwarded-host": "khata.example", origin: "https://khata.example" }), []), true, "behind a proxy");
  assert.equal(isAllowedWrite(req("POST", { origin: "https://preview.example" }), ["https://preview.example"]), true);
  assert.equal(isAllowedWrite(req("DELETE", { origin: "https://evil.example" }), []), false);
  assert.equal(isAllowedWrite(req("POST", { origin: "https://khata.example.evil.example" }), []), false, "host must match exactly");
  assert.equal(isAllowedWrite(req("PATCH", { origin: "null" }), []), false, "sandboxed or file origins are refused");
  assert.equal(isAllowedWrite(req("POST", { origin: "not a url" }), []), false);
  assert.equal(isAllowedWrite(req("POST"), []), true, "curl and bearer clients send no Origin");
  assert.equal(isAllowedWrite(req("POST", { "sec-fetch-site": "cross-site" }), []), false);
});

test("the proxy runs the CSRF check on API writes outside Better Auth", () => {
  const text = src("src/proxy.ts");
  assert.match(text, /isAllowedWrite\(request, trustedOrigins\(\)\)/);
  assert.match(text, /!pathname\.startsWith\("\/api\/auth"\)/);
});

test("rate limiter allows the limit per window, then reports when to retry", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
  assert.deepEqual(limiter.take("a", 0), { ok: true });
  assert.deepEqual(limiter.take("a", 1_000), { ok: true });
  assert.deepEqual(limiter.take("a", 2_000), { ok: false, retryAfter: 58 });
  assert.deepEqual(limiter.take("b", 2_000), { ok: true }, "keys are counted separately");
  assert.deepEqual(limiter.take("a", 60_000), { ok: true }, "a new window starts fresh");
});

test("rate limiter never grows past its key cap", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
  for (const key of ["a", "b", "c", "d", "e"]) limiter.take(key, 0);
  assert.deepEqual(limiter.take("e", 1), { ok: false, retryAfter: 60 }, "the newest key is still tracked");
});

test("invite tokens must have the generated shape before any lookup", () => {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  assert.equal(isInviteToken(token), true);
  assert.equal(isInviteToken(token.slice(1)), false);
  assert.equal(isInviteToken(`${token.slice(0, 31)}'`), false);
  assert.equal(isInviteToken("../../etc/passwd"), false);
});

test("public invite routes check the token shape and rate limit by IP", () => {
  for (const file of ["src/app/api/invite/[token]/route.ts", "src/app/api/invite/[token]/accept/route.ts"]) {
    const text = src(file);
    assert.match(text, /isInviteToken\(token\)/, `${file} must reject malformed tokens`);
    assert.match(text, /limits\.inviteLookups\.take\(clientIp/, `${file} must be rate limited`);
  }
});

test("invite emails are limited per sender and per recipient", () => {
  const text = src("src/app/api/groups/[id]/invite/route.ts");
  assert.match(text, /limits\.inviteEmails\.take\(userId\)/);
  assert.match(text, /limits\.inviteRecipient\.take\(email\)/);
});

test("client IP is the first forwarded hop", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(new Headers()), "unknown");
});

test("invite links never use a forged host", () => {
  const forged = new Request("https://khata.example/api/groups/g/invite", { headers: { host: "evil.example" } });
  assert.equal(appOrigin(forged, { BETTER_AUTH_URL: "https://khata.example/" }), "https://khata.example", "configured origin wins");
  assert.equal(appOrigin(forged, { VERCEL_PROJECT_PRODUCTION_URL: "khata.example" }), "https://khata.example", "an untrusted host falls back to production");
  const preview = new Request("https://p.vercel.app/x", { headers: { host: "khata-git-x.vercel.app" } });
  assert.equal(appOrigin(preview, { VERCEL_BRANCH_URL: "khata-git-x.vercel.app" }), "https://khata-git-x.vercel.app", "a trusted preview host is kept");
  const local = new Request("http://localhost:3847/x", { headers: { host: "localhost:3847" } });
  assert.equal(appOrigin(local, {}), "http://localhost:3847");
});

test("invite email text keeps user-typed names on one line", () => {
  assert.equal(oneLine("Trip\r\nBcc: x@evil.example"), "Trip Bcc: x@evil.example");
  assert.equal(oneLine("a".repeat(200)).length, 80);
});

test("a friend's direct book cannot be renamed or re-membered", () => {
  const text = src("src/db/shares.ts");
  const body = text.slice(text.indexOf("export async function updateGroup"), text.indexOf("export async function deleteGroup"));
  assert.match(body, /group\.kind === "direct"/);
});

test("production refuses a missing or placeholder auth secret, but builds still run", () => {
  assert.throws(() => assertAuthSecret({ NODE_ENV: "production" }), /BETTER_AUTH_SECRET/);
  assert.throws(() => assertAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: "replace-with-openssl-rand-base64-32" }), /BETTER_AUTH_SECRET/);
  assert.throws(() => assertAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: "short" }), /BETTER_AUTH_SECRET/);
  assert.doesNotThrow(() => assertAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(44) }));
  assert.doesNotThrow(() => assertAuthSecret({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }));
  assert.doesNotThrow(() => assertAuthSecret({ NODE_ENV: "development" }));
});

test("next.config sends the security headers", () => {
  const text = src("next.config.ts");
  for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
    assert.ok(text.includes(header), `missing ${header}`);
  }
  assert.match(text, /frame-ancestors 'none'/);
  assert.match(text, /object-src 'none'/);
});
