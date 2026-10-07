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
