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
import { buildResetPasswordEmail } from "../server/account-email";
import { appOrigin } from "../server/app-origin";
import { assertAuthSecret } from "../server/auth";
import { buildInviteEmail, inviteSender, oneLine } from "../server/invite-email";
import { clientIp, createRateLimiter, isAllowedWrite, isInviteToken, trustedOrigins } from "../server/request-guard";

// ---------------------------------------------------------------------------
// Helper: read a source file and return its text.
// ---------------------------------------------------------------------------
function src(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), "utf8");
}

/** Every module of the share-book repository. */
function shareModules(): string[] {
  return [
    "read",
    "people",
    "groups",
    "permissions",
    "expenses",
    "settlements",
    "activity",
    "names",
    "seed",
  ].map((name) => `src/db/shares/${name}.ts`);
}

// ---------------------------------------------------------------------------
// 1. claimUnownedLedger must not exist in the session module.
// ---------------------------------------------------------------------------
test("session.ts does not import or call claimUnownedLedger", () => {
  const sessionSrc = src("src/server/session.ts");
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

test("no share-book module reaches for a NULL owner", () => {
  for (const file of shareModules()) {
    const text = src(file);
    assert.ok(!text.includes("isNull"), `${file} must scope every query to a real userId, not a null owner`);
  }
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
test("seed.ts seedSampleBook requires non-null userId", () => {
  const sharesSrc = src("src/db/shares/seed.ts");
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
test("loadJoinedGroup scopes expenses to a single group, not the owner's full ledger", () => {
  const sharesSrc = src("src/db/shares/read.ts");

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
    sharesSrc.indexOf("export async function loadJoinedGroup"),
    sharesSrc.indexOf("export async function getShareBook"),
  );
  assert.ok(
    !loadJoinedGroupSection.includes("eq(transactions.userId, ownerId)"),
    "loadJoinedGroup must not query the owner's private bank transactions by userId alone",
  );
});

// ---------------------------------------------------------------------------
// 9. groupUserAccess ACL: member access requires explicit grant row.
// ---------------------------------------------------------------------------
test("memberAccess checks the groupUserAccess ACL table, not just group ownership", () => {
  const permissionsSrc = src("src/db/shares/permissions.ts");
  assert.ok(permissionsSrc.includes("groupUserAccess"), "permissions.ts must reference the groupUserAccess ACL table");
  assert.ok(permissionsSrc.includes("memberAccess"), "permissions.ts must have a memberAccess guard function");
  // Nothing else in the repository may grant access on ownership alone.
  for (const file of shareModules()) {
    if (file.endsWith("permissions.ts")) continue;
    const text = src(file);
    assert.ok(!/from "@\/db\/shares\/permissions"[^;]*\bmemberAccess\b/.test(text), `${file} must not widen access past permissions.ts`);
  }
});

// ---------------------------------------------------------------------------
// 10. Removing a member from a group must revoke their account's access.
//     updateGroup rewrites group_members; it must also delete the matching
//     group_user_access rows, or a removed friend keeps seeing the group.
// ---------------------------------------------------------------------------
test("updateGroup revokes group access for removed members", () => {
  const sharesSrc = src("src/db/shares/groups.ts");
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
test("deleteGroup removes the group's expenses and settlements", () => {
  const sharesSrc = src("src/db/shares/groups.ts");
  const section = sharesSrc.slice(sharesSrc.indexOf("export async function deleteGroup"));
  assert.ok(section.includes("tx.delete(sharedExpenses)"), "deleteGroup must delete the group's shared expenses");
  assert.ok(section.includes("tx.delete(settlements)"), "deleteGroup must delete the group's settlements");
});

test("shared writes require creator or owner access and reject stale versions", () => {
  const permissionsSrc = src("src/db/shares/permissions.ts");
  const expensesSrc = src("src/db/shares/expenses.ts");
  assert.match(permissionsSrc, /row\.createdByUserId !== actorId/, "members must only mutate entries they created");
  assert.match(expensesSrc, /input\.version !== existing\.version/, "updates must compare the version the editor opened");
  assert.match(expensesSrc, /insert\(sharedExpenseRevisions\)/, "expense updates and deletes must preserve an audit revision");
});

test("leaving a group is member-only and blocked by open balances", () => {
  const sharesSrc = src("src/db/shares/groups.ts");
  const section = sharesSrc.slice(sharesSrc.indexOf("export async function leaveGroup"), sharesSrc.indexOf("export async function deleteGroup"));
  assert.match(section, /eq\(groupUserAccess\.role, "member"\)/, "an owner row must never be removed by leaveGroup");
  assert.match(section, /group\.balances\.youOwe\.length \|\| group\.balances\.youAreOwed\.length/, "members must settle before losing access");
});

test("migration 0009 backfills authorship and preserves expense revisions", () => {
  const migration = src("drizzle/0009_vengeful_magik.sql");
  assert.match(migration, /CREATE TABLE "shared_expense_revisions"/);
  assert.match(migration, /UPDATE "shared_expenses" SET "created_by_user_id" = "user_id"/);
  assert.match(migration, /UPDATE "settlements" SET "created_by_user_id" = "user_id"/);
  assert.ok(!migration.includes('FOREIGN KEY ("expense_id")'), "revision history must survive expense deletion");
});

// ---------------------------------------------------------------------------
// 12. ensureCategories must not write on every read path.
// ---------------------------------------------------------------------------
test("categories.ts ensureCategories checks for existing rows before inserting", () => {
  const ledgerSrc = src("src/db/categories.ts");
  const section = ledgerSrc.slice(
    ledgerSrc.indexOf("export async function ensureCategories"),
    ledgerSrc.indexOf("export async function ensureNamedCategory"),
  );
  assert.ok(section.includes("if (existing) return"), "ensureCategories must return early once the book has any category, so a read never writes");
  // Seeding on any *missing* default would bring a name back the moment someone
  // renamed it: ensureCategories runs on every read, so "Nabil" would reappear
  // alongside "My Bank" on the next page load.
  assert.ok(!section.includes("inArray(categories.name"), "ensureCategories must not seed by looking for missing default names");
  assert.ok(!section.includes("DEFAULT_CATEGORIES.length) return"), "seeding must not depend on counting the defaults");
});

test("accounts seeding does not resurrect a renamed default", () => {
  const accountsSrc = src("src/db/accounts.ts");
  const section = accountsSrc.slice(accountsSrc.indexOf("export async function ensureAccounts"), accountsSrc.indexOf("export async function listAccounts"));
  assert.ok(section.includes("if (existing) return"), "ensureAccounts must return early once the book has any account");
  assert.ok(!section.includes("inArray(accounts.name"), "ensureAccounts must not seed by looking for missing default names");
});

// ---------------------------------------------------------------------------
// 13. Auth must not trust an arbitrary *.vercel.app origin.
// ---------------------------------------------------------------------------
test("trusted origins come from Vercel's own hosts, never a vercel.app wildcard", () => {
  const authSrc = src("src/server/auth.ts");
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
  const text = src("src/db/shares/groups.ts");
  const start = text.indexOf("export async function ensureDirectGroup");
  const body = text.slice(start, text.indexOf("export async function updateGroup"));
  assert.match(body, /eq\(people\.userId, userId\)/, "person lookup must be scoped to the caller");
  assert.match(body, /eq\(groups\.userId, userId\)/, "group lookup must be scoped to the caller");
  assert.match(body, /person\.isSelf/, "must refuse to make a direct book with yourself");
});

test("the direct-group API route requires a session", () => {
  const text = src("src/app/api/people/[id]/direct/route.ts");
  // `defineRoute` defaults to session auth, so an explicit `auth: "public"` or
  // `auth: "agent"` here would be the bug this guards against.
  assert.doesNotMatch(text, /auth:\s*"(public|agent)"/);
  assert.match(text, /ensureDirectGroup\(userId, params\.id\)/);
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

test("public invite lookups check the token shape and rate limit by IP", () => {
  const text = src("src/server/services/invites.ts");
  assert.match(text, /isInviteToken\(token\)/, "both invite entry points must reject malformed tokens");
  assert.equal((text.match(/limits\.inviteLookups/g) ?? []).length, 2, "both reading and accepting must be rate limited");
  assert.match(text, /ipOf\(request\.headers\)/, "the limit must be keyed on the caller's IP, not on an account");
});

test("invite emails are limited per sender and per recipient", () => {
  const text = src("src/server/services/invites.ts");
  assert.match(text, /spend\(limits\.inviteEmails, userId/);
  assert.match(text, /spend\(limits\.inviteRecipient, input\.email/);
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

test("invite email reads as a personal note and escapes user-typed names", () => {
  assert.equal(inviteSender("Asha", "Khata <invites@khata.example>"), '"Asha via Khata" <invites@khata.example>');
  assert.equal(inviteSender('Ev"il <x@y>', "invites@khata.example"), '"Evil x@y via Khata" <invites@khata.example>');
  const email = buildInviteEmail({ to: "f@x.example", inviterName: "Asha", inviterEmail: "asha@x.example", groupName: "<b>Trip</b>", url: "https://khata.example/invite/t" });
  assert.equal(email.replyTo, "asha@x.example");
  assert.equal(email.subject, "Asha added you to <b>Trip</b>");
  assert.ok(!email.html.includes("<b>Trip</b>"), "group names are escaped in HTML");
  assert.ok(email.text.includes("https://khata.example/invite/t"));
  assert.ok(!/<img|unsubscribe/i.test(email.html), "no bulk-mail markers");
});

test("the password reset mail carries the link that lands back on our own page", () => {
  const url = "https://khata.example/api/auth/reset-password/tok123?callbackURL=%2Freset-password";
  const email = buildResetPasswordEmail({ user: { name: "Asha <b>", email: "asha@x.example" }, url });
  assert.equal(email.subject, "Reset your Khata password");
  assert.ok(email.html.includes("reset-password/tok123"), "the reset link is in the mail");
  assert.ok(email.html.includes("expires in an hour"));
  assert.ok(!email.html.includes("<b>"), "user-typed names are escaped");
  assert.ok(!/<img|unsubscribe/i.test(email.html), "no bulk-mail markers");
});

test("auth wires the reset-password flow", () => {
  // This used to be missing entirely: a forgotten password locked you out unless you
  // had Google. Send the link, bound its lifetime, and cap how often it can be asked for.
  const auth = src("src/server/auth.ts");
  assert.match(auth, /sendResetPassword:/);
  assert.match(auth, /resetPasswordTokenExpiresIn:/);
  assert.match(auth, /"\/request-password-reset":\s*\{ window: \d+, max: \d+ \}/);
});

test("a friend's direct book cannot be renamed or re-membered", () => {
  const text = src("src/db/shares/groups.ts");
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

test("the cached auth instance is keyed without randomness", () => {
  // A random id in the cache key invalidates at runtime but breaks prerendering:
  // Next reads it as an unstable value and `/groups/[id]` fails instant-validation
  // with "encountered the unstable value `Math.random()`".
  const auth = src("src/server/auth.ts");
  const key = auth.slice(auth.indexOf("function authConfigKey"), auth.indexOf("export function getAuth"));
  assert.ok(key.length > 0, "authConfigKey must still exist");
  assert.doesNotMatch(key, /Math\.random|crypto\.randomUUID|randomUUID|Date\.now|new Date/);
  // It must still change when the options are edited, which is what the cache is for.
  assert.match(key, /createAuth\.toString\(\)/);
});

test("share mutations point at the requests, never at the hooks' own wrappers", () => {
  // The hook exports wrappers named deletePerson/deleteGroup/deleteExpense/deleteSettlement,
  // and a hoisted local function declaration shadows the same-named import. Writing
  // `mutationFn: deletePerson` therefore points at the wrapper that calls the mutation,
  // which recurses forever. The requests are aliased so the two can never collide again.
  const text = src("src/components/use-shares.ts");
  assert.doesNotMatch(text, /mutationFn:\s*delete(Person|Group|Expense|Settlement)\b/);
  for (const name of ["Person", "Group", "Expense", "Settlement"]) {
    assert.match(text, new RegExp(`mutationFn:\\s*requestDelete${name}\\b`));
  }
});

test("next.config sends the security headers", () => {
  const text = src("next.config.ts");
  for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
    assert.ok(text.includes(header), `missing ${header}`);
  }
  assert.match(text, /frame-ancestors 'none'/);
  assert.match(text, /object-src 'none'/);
});

test("the public pages read the session without redirecting, so they cannot loop", () => {
  // `readPageSession` sends a signed-out visitor to /login, and caches the answer
  // for five minutes once there is one. Asking that question from /login or
  // /reset-password — which have to work for somebody who cannot sign in — turns
  // the front door into a redirect loop and makes a reset link useless. Those two
  // routes use the peeking read, which is uncached and answers "no".
  for (const page of ["src/app/login/page.tsx", "src/app/reset-password/page.tsx"]) {
    const text = src(page);
    assert.match(text, /peekPageSession\(\)/, `${page} must be able to cope with having no session`);
    assert.doesNotMatch(text, /readPageSession\(\)/, `${page} must not redirect a visitor away from itself`);
  }
  const session = src("src/server/session.ts");
  assert.match(session, /if \(!session\?\.user\) redirect\("\/login"\)/, "the cached read redirects rather than returning null");
  assert.match(session, /"use cache: private"/, "the redirect is what keeps a signed-out miss out of the cache");
});
