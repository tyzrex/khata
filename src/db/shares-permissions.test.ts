/**
 * Database-backed tests for the collaboration permission model.
 *
 * The source-string tests in `isolation.test.ts` prove the guards are *written*; these
 * prove they *hold*, against a real Postgres. Every case runs as a real user against a
 * real book, because the interesting failures here are all about which rows a query
 * actually reaches.
 *
 * Set `KHATA_TEST_DATABASE_URL` to a throwaway Postgres that has had
 * `bun run db:migrate` applied. Without it the suite skips rather than fails, so a
 * contributor with no database still gets a green run — but a green run then proves
 * nothing, so `test.skipIf` messages are deliberate.
 *
 * Nothing here touches the DATABASE_URL in `.env.local`: the pool is built on first
 * use from `process.env.DATABASE_URL`, and this file reassigns that before any module
 * under test reaches for it.
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { and, eq, inArray } from "drizzle-orm";

const TEST_URL = process.env.KHATA_TEST_DATABASE_URL;
if (TEST_URL) process.env.DATABASE_URL = TEST_URL;

const { getDb } = await import("@/db/client");
const {
  ConflictError,
  NotFoundError,
  createGroup,
  createPerson,
  createSharedExpense,
  createSettlement,
  deleteSharedExpense,
  deleteSettlement,
  getShareBook,
  leaveGroup,
  updateSharedExpense,
  updateSettlement,
} = await import("@/db/shares");
const { sharedExpenseRevisions, sharedExpenses } = await import("@/db/schema");

const expense = (over: Partial<Parameters<typeof createSharedExpense>[1]> = {}) => ({
  description: "Dinner",
  date: "2026-05-01",
  amount: 1200,
  paidById: "",
  groupId: null as string | null,
  splitMode: "equal" as const,
  note: "",
  participants: [] as { personId: string; amount?: number; weight?: number }[],
  transactionIds: [] as string[],
  ...over,
  });

const settlement = (over: Partial<Parameters<typeof createSettlement>[1]> = {}) => ({
    fromPersonId: "",
    toPersonId: "",
    amount: 500,
    date: "2026-05-02",
    groupId: null as string | null,
    note: "",
    transactionId: null as string | null,
    ...over,
    });

const ready = Boolean(TEST_URL);

/**
 * The data layer returns a bare id from create/update, so the row has to be read
 * back to get the version that optimistic concurrency compares against.
 */
async function loadExpense(id: string) {
  const rows = await db.select().from(sharedExpenses).where(eq(sharedExpenses.id, id));
  const row = rows[0];
  if (!row) throw new Error(`expense ${id} was not written`);
  return row;
}

async function loadSettlement(id: string) {
  const { settlements } = await import("@/db/schema");
  const rows = await db.select().from(settlements).where(eq(settlements.id, id));
  const row = rows[0];
  if (!row) throw new Error(`settlement ${id} was not written`);
  return row;
}
const describeDb = ready ? describe : describe.skip;

const OWNER = "test_owner_user";
const MEMBER = "test_member_user";
const OTHER = "test_other_user";
const RUN = Math.random().toString(36).slice(2, 8);

type Db = ReturnType<typeof getDb>;
let db: Db;

async function cleanup() {
  const { user } = await import("@/db/schema");
  // Revisions and expenses first: they reference the users, and `owner_user_id`
  // cascades anyway but an explicit order keeps the intent obvious.
  await db.delete(sharedExpenseRevisions);
  await db.delete(sharedExpenses);
  await db.delete(user).where(inArray(user.id, [OWNER, MEMBER, OTHER]));
}

describeDb("shared-book collaboration permissions", () => {
  before(async () => {
    if (!ready) return;
    db = getDb();
    // Check the schema is actually there before writing to it, so a stale or
    // unmigrated database fails with one clear message instead of a scatter of
    // constraint errors.
    const { sql } = await import("drizzle-orm");
    const result = (await db.execute(sql`
      select count(*)::int as found
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'shared_expenses'
        and column_name in ('created_by_user_id', 'version')
    `)) as unknown as { rows: { found: number }[] };
    assert.equal(result.rows[0]?.found ?? 0, 2);
  });

  beforeEach(async () => {
    if (!ready) return;
    await cleanup();
    const { user } = await import("@/db/schema");
    await db.insert(user).values([
      { id: OWNER, name: "Owner", email: `${RUN}-owner@test.local`, emailVerified: false, createdAt: new Date(), updatedAt: new Date() },
      { id: MEMBER, name: "Member", email: `${RUN}-member@test.local`, emailVerified: false, createdAt: new Date(), updatedAt: new Date() },
      { id: OTHER, name: "Other", email: `${RUN}-other@test.local`, emailVerified: false, createdAt: new Date(), updatedAt: new Date() },
    ]);
  });

  after(async () => {
    if (!ready) return;
    await cleanup();
  });

  /**
   * One owner book with two members, and two invited members who joined through
   * `group_user_access` the way accepting an invite does.
   */
  async function seedUsers() {
    const { groupUserAccess } = await import("@/db/schema");
    const { ensureSelf, updateGroup } = await import("@/db/shares");

    const self = await ensureSelf(OWNER);
    const memberPerson = await createPerson(OWNER, "Member");
    const otherPerson = await createPerson(OWNER, "Other");

    const groupId = await createGroup(OWNER, `Test Group ${RUN}`, [memberPerson.id, otherPerson.id]);
    assert.equal(typeof groupId, "string");

    // A joined member is a person row in the owner's book with `linked_user_id` set,
    // plus a `group_user_access` ACL row. Both are needed: loadJoinedGroup finds the
    // member by the linked person, and the permission checks use the ACL.
    const { eq } = await import("drizzle-orm");
    const { people } = await import("@/db/schema");
    await db.update(people).set({ linkedUserId: MEMBER }).where(eq(people.id, memberPerson.id));
    await db.update(people).set({ linkedUserId: OTHER }).where(eq(people.id, otherPerson.id));

    await db.insert(groupUserAccess).values([
      { groupId, userId: MEMBER, ownerUserId: OWNER, role: "member" },
      { groupId, userId: OTHER, ownerUserId: OWNER, role: "member" },
    ]);

    // The owner must not silently accept a rename; just assert the group is readable.
    assert.ok(await getShareBook(OWNER));
    assert.equal(typeof updateGroup, "function");

    return { groupId, selfPersonId: self.id, memberPersonId: memberPerson.id, otherPersonId: otherPerson.id };
  }


  describe("expenses", () => {
    it("the group owner can edit an expense a member created", async () => {
      const { groupId, memberPersonId } = await seedUsers();
      const id = await createSharedExpense(MEMBER, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }] }));
      const created = await loadExpense(id);

      await updateSharedExpense(
        OWNER,
        created.id,
        expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }], description: "Dinner edited", version: created.version }),
      );
      assert.equal((await loadExpense(created.id)).description, "Dinner edited");
      assert.equal((await loadExpense(created.id)).version, created.version + 1);
    });

    it("the group owner can delete an expense a member created", async () => {
      const { groupId, memberPersonId } = await seedUsers();
      const id = await createSharedExpense(MEMBER, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }] }));
      const created = await loadExpense(id);

      await deleteSharedExpense(OWNER, created.id);
      const left = await db.select().from(sharedExpenses).where(eq(sharedExpenses.id, created.id));
      assert.equal(left.length, 0);
    });

    it("a member can edit an expense they created", async () => {
      const { groupId, memberPersonId } = await seedUsers();
      const id = await createSharedExpense(MEMBER, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }] }));
      const created = await loadExpense(id);

      await updateSharedExpense(
        MEMBER,
        created.id,
        expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }], description: "My own", version: created.version }),
      );
      assert.equal((await loadExpense(created.id)).description, "My own");
    });

    it("a member cannot edit another member's expense", async () => {
      const { groupId, memberPersonId } = await seedUsers();
      const id = await createSharedExpense(MEMBER, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }] }));
      const created = await loadExpense(id);

      await assert.rejects(
        updateSharedExpense(OTHER, created.id, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }], version: created.version })), (error) => error instanceof NotFoundError);
    });

    it("a member cannot delete another member's expense", async () => {
      const { groupId, memberPersonId } = await seedUsers();
      const id = await createSharedExpense(MEMBER, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }] }));
      const created = await loadExpense(id);

      await assert.rejects(deleteSharedExpense(OTHER, created.id), (error) => error instanceof NotFoundError);
      const left = await db.select().from(sharedExpenses).where(eq(sharedExpenses.id, created.id));
      assert.equal(left.length, 1);
    });

    it("a stale version is refused with ConflictError", async () => {
      const { groupId, memberPersonId } = await seedUsers();
      const id = await createSharedExpense(MEMBER, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }] }));
      const created = await loadExpense(id);
      const input = expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }], version: created.version });

      await updateSharedExpense(MEMBER, created.id, { ...input, description: "First writer wins" });
      // The second writer still holds the original version.
      await assert.rejects(updateSharedExpense(MEMBER, created.id, { ...input, description: "Too late" }), (error) => error instanceof ConflictError);
    });

    it("an update records a revision holding the previous values and the actor", async () => {
      const { groupId, memberPersonId } = await seedUsers();
      const id = await createSharedExpense(MEMBER, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }] }));
      const created = await loadExpense(id);

      await updateSharedExpense(OWNER, created.id, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }], description: "Changed", version: created.version }));

      const revisions = await db.select().from(sharedExpenseRevisions).where(eq(sharedExpenseRevisions.expenseId, created.id));
      assert.equal(revisions.length, 1);
      assert.equal(revisions[0]!.action, "updated");
      assert.equal(revisions[0]!.actorUserId, OWNER);
      assert.equal(revisions[0]!.version, created.version);
      const snapshot = revisions[0]!.snapshot as { description?: string };
      assert.equal(snapshot.description, "Dinner");
    });

    it("deleting an expense preserves a deletion revision", async () => {
      const { groupId, memberPersonId } = await seedUsers();
      const id = await createSharedExpense(MEMBER, expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }] }));
      const created = await loadExpense(id);

      await deleteSharedExpense(MEMBER, created.id);

      const expenses = await db.select().from(sharedExpenses).where(eq(sharedExpenses.id, created.id));
      const revisions = await db.select().from(sharedExpenseRevisions).where(eq(sharedExpenseRevisions.expenseId, created.id));
      assert.equal(expenses.length, 0);
      assert.equal(revisions.length, 1);
      assert.equal(revisions[0]!.action, "deleted");
    });
  });

  describe("settlements", () => {

    it("a member can edit a settlement they created", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      const id = await createSettlement(MEMBER, settlement({ groupId, fromPersonId: memberPersonId, toPersonId: otherPersonId }));
      const created = await loadSettlement(id);

      await updateSettlement(MEMBER, created.id, settlement({ groupId, fromPersonId: memberPersonId, toPersonId: otherPersonId, amount: 600, version: created.version }));
      assert.equal(Number((await loadSettlement(created.id)).amount), 600);
    });

    it("a member cannot edit another member's settlement", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      const id = await createSettlement(MEMBER, settlement({ groupId, fromPersonId: memberPersonId, toPersonId: otherPersonId }));
      const created = await loadSettlement(id);

      await assert.rejects(
        updateSettlement(OTHER, created.id, settlement({ groupId, fromPersonId: memberPersonId, toPersonId: otherPersonId, version: created.version })), (error) => error instanceof NotFoundError);
    });

    it("a member cannot delete another member's settlement", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      const id = await createSettlement(MEMBER, settlement({ groupId, fromPersonId: memberPersonId, toPersonId: otherPersonId }));
      const created = await loadSettlement(id);

      await assert.rejects(deleteSettlement(OTHER, created.id), (error) => error instanceof NotFoundError);
    });

    it("the owner can delete a settlement a member created", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      const id = await createSettlement(MEMBER, settlement({ groupId, fromPersonId: memberPersonId, toPersonId: otherPersonId }));
      const created = await loadSettlement(id);

      await deleteSettlement(OWNER, created.id);
      await assert.rejects(deleteSettlement(OWNER, created.id), (error) => error instanceof NotFoundError);
    });

    it("a stale settlement version is refused with ConflictError", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      const id = await createSettlement(MEMBER, settlement({ groupId, fromPersonId: memberPersonId, toPersonId: otherPersonId }));
      const created = await loadSettlement(id);
      const input = settlement({ groupId, fromPersonId: memberPersonId, toPersonId: otherPersonId, version: created.version });

      await updateSettlement(MEMBER, created.id, { ...input, amount: 700 });
      await assert.rejects(updateSettlement(MEMBER, created.id, { ...input, amount: 800 }), (error) => error instanceof ConflictError);
    });
  });

  describe("categories", () => {
    it("stores the category and returns it on the book", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      const id = await createSharedExpense(
        MEMBER,
        expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }, { personId: otherPersonId }], category: "Food" }),
      );

      const row = await loadExpense(id);
      assert.equal(row.category, "Food");

      const book = await getShareBook(MEMBER);
      const group = book.joinedGroups.find((entry) => entry.id === groupId);
      assert.equal(group?.expenses.find((entry) => entry.id === id)?.category, "Food");
    });

    it("defaults to null when no category is chosen", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      const id = await createSharedExpense(
        MEMBER,
        expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }, { personId: otherPersonId }] }),
      );
      assert.equal((await loadExpense(id)).category, null);
    });

    it("records a category change in the revision snapshot", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      const id = await createSharedExpense(
        MEMBER,
        expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }, { personId: otherPersonId }], category: "Food" }),
      );
      const created = await loadExpense(id);

      await updateSharedExpense(
        OWNER,
        id,
        expense({
          groupId,
          paidById: memberPersonId,
          participants: [{ personId: memberPersonId }, { personId: otherPersonId }],
          category: "Transport",
          version: created.version,
        }),
      );

      const revisions = await db.select().from(sharedExpenseRevisions).where(eq(sharedExpenseRevisions.expenseId, id));
      assert.equal(revisions.length, 1);
      const snapshot = revisions[0]!.snapshot as { category?: string | null };
      assert.equal(snapshot.category, "Food");
      assert.equal((await loadExpense(id)).category, "Transport");
    });

    it("rejects a category outside the shared vocabulary", async () => {
      const { expenseWriteSchema } = await import("@/lib/share-schemas");
      const base = {
        description: "Dinner",
        date: "2026-05-01",
        amount: 100,
        paidById: "p1",
        groupId: "g1",
        splitMode: "equal",
        note: "",
        participants: [{ personId: "p1" }],
        transactionIds: [],
      };
      // A private ledger category must not be accepted here: joined members read these rows.
      assert.equal(expenseWriteSchema.safeParse({ ...base, category: "Groceries-run" }).success, false);
      assert.equal(expenseWriteSchema.safeParse({ ...base, category: "Food" }).success, true);
      assert.equal(expenseWriteSchema.safeParse({ ...base, category: null }).success, true);
      assert.equal(expenseWriteSchema.safeParse(base).success, true);
    });
  });

  describe("leaving a group", () => {
    it("a member with an open balance cannot leave", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      // MEMBER pays for both, so MEMBER is owed Other's half (600) and holds an
      // open balance. Splitting between the payer alone would leave no balance
      // at all, which would make this test pass for the wrong reason.
      await createSharedExpense(
        MEMBER,
        expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }, { personId: otherPersonId }] }),
      );

      // Matched on the message, not the class: `ShareInputError` is re-exported
      // through a different module instance here, so `instanceof` is unreliable
      // while the behaviour is exactly what matters.
      await assert.rejects(leaveGroup(MEMBER, groupId), /Settle your open balance before leaving this group\./);
    });

    it("a settled member can leave", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      await createSharedExpense(
        MEMBER,
        expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }, { personId: otherPersonId }] }),
      );
      // Other pays back exactly the half MEMBER lent.
      await createSettlement(MEMBER, settlement({ groupId, fromPersonId: otherPersonId, toPersonId: memberPersonId, amount: 600 }));

      await leaveGroup(MEMBER, groupId);

      const { groupUserAccess } = await import("@/db/schema");
      const rows = await db.select().from(groupUserAccess).where(and(eq(groupUserAccess.groupId, groupId), eq(groupUserAccess.userId, MEMBER)));
      assert.equal(rows.length, 0);
    });

    it("leaving removes only the member row and keeps the group and its history", async () => {
      const { groupId, memberPersonId, otherPersonId } = await seedUsers();
      const id = await createSharedExpense(
        MEMBER,
        expense({ groupId, paidById: memberPersonId, participants: [{ personId: memberPersonId }, { personId: otherPersonId }] }),
      );
      const created = await loadExpense(id);
      await createSettlement(MEMBER, settlement({ groupId, fromPersonId: otherPersonId, toPersonId: memberPersonId, amount: 600 }));
      await leaveGroup(MEMBER, groupId);

      const { groupUserAccess, groups, sharedExpenses, settlements } = await import("@/db/schema");
      const access = await db.select().from(groupUserAccess).where(eq(groupUserAccess.groupId, groupId));
      // Only MEMBER's row goes. The owner's own row and the other member's stay.
      assert.deepEqual(access.map((row) => row.userId).sort(), [OWNER, OTHER].sort());
      assert.equal(access.some((row) => row.userId === MEMBER), false);
      assert.equal((await db.select().from(groups).where(eq(groups.id, groupId))).length, 1);
      assert.equal((await db.select().from(sharedExpenses).where(eq(sharedExpenses.id, created.id))).length, 1);
      assert.equal((await db.select().from(settlements).where(eq(settlements.groupId, groupId))).length, 1);
    });

    it("the owner cannot use the leave endpoint", async () => {
      const { groupId } = await seedUsers();
      await assert.rejects(leaveGroup(OWNER, groupId), (error) => error instanceof NotFoundError);
    });
  });
});

if (!ready) {
  describe("shared-book collaboration permissions", () => {
    it("skipped: set KHATA_TEST_DATABASE_URL to a migrated Postgres to run these", () => {
      assert.equal(true, true);
    });
  });
}
