import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  expenseTransactions,
  groupMembers,
  groupUserAccess,
  groups,
  people,
  settlements,
  sharedExpenseRevisions,
  sharedExpenses,
  sharedSplits,
  transactions,
  user,
} from "@/db/schema";
import { sampleExpenses, sampleGroup, samplePeople, sampleSettlements } from "@/lib/sample-book";
import type { SharedActivity } from "@/db/push-activity";
import {
  buildSplits,
  netsFromDebts,
  pairwiseDebts,
  ShareInputError,
  simplifyNets,
  type ExpenseForBalance,
  type SettlementForBalance,
  type SplitMode,
} from "@/lib/split";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return pgCode(error.cause);
  return undefined;
}

type PersonDto = { id: string; name: string; isSelf: boolean; linkedUserId: string | null };

type DebtDto = {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  amount: number;
};

export type BalanceScope = {
  youOwe: DebtDto[];
  youAreOwed: DebtDto[];
  others: DebtDto[];
  simplified: DebtDto[];
};

export type ExpenseRevisionSnapshot = {
  description: string;
  amount: number;
  date: string;
  paidByName: string;
  splitMode: string;
  note: string;
};

export type ExpenseRevisionDto = {
  actorName: string;
  action: "updated" | "deleted";
  version: number;
  createdAt: string;
  snapshot: ExpenseRevisionSnapshot;
};

export type ExpenseDto = {
  id: string;
  groupId: string | null;
  groupName: string | null;
  description: string;
  date: string;
  amount: number;
  paidById: string;
  paidByName: string;
  splitMode: SplitMode;
  /** One of SHARED_CATEGORIES, or null when unset. */
  category: string | null;
  note: string;
  createdByName: string | null;
  updatedByName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  revisions: ExpenseRevisionDto[];
  splits: { personId: string; name: string; amount: number; weight: number | null }[];
  transactionIds: string[];
};

export type SettlementDto = {
  id: string;
  groupId: string | null;
  groupName: string | null;
  fromPersonId: string;
  toPersonId: string;
  fromName: string;
  toName: string;
  amount: number;
  date: string;
  note: string;
  createdByName: string | null;
  updatedByName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  transaction: { id: string; merchant: string; amount: number; account: string; date: string; type: string } | null;
};

export type GroupKind = "group" | "direct";

export type JoinedGroup = {
  id: string;
  name: string;
  kind: GroupKind;
  ownerName: string;
  members: PersonDto[];
  people: PersonDto[];
  self: PersonDto;
  balances: BalanceScope;
  expenses: ExpenseDto[];
  settlements: SettlementDto[];
};

export type ShareBook = {
  self: PersonDto;
  people: PersonDto[];
  groups: {
    id: string;
    name: string;
    kind: GroupKind;
    members: PersonDto[];
    balances: BalanceScope;
  }[];
  joinedGroups: JoinedGroup[];
  overall: BalanceScope;
  expenses: ExpenseDto[];
  settlements: SettlementDto[];
  links: {
    transactionId: string;
    kind: "settlement" | "expense";
    title: string;
    shareAmount: number;
    bankAmount: number | null;
    detail: string;
  }[];
};

function nameOf(list: PersonDto[], id: string) {
  return list.find((person) => person.id === id)?.name ?? "Someone";
}

function iso(value: Date) {
  return value.toISOString();
}

async function loadUserNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();
  const rows = await getDb().select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}

function revisionsFor(expenseId: string, rows: (typeof sharedExpenseRevisions.$inferSelect)[]): ExpenseRevisionDto[] {
  return rows
    .filter((revision) => revision.expenseId === expenseId)
    .map((revision) => ({
      actorName: revision.actorName,
      action: revision.action as ExpenseRevisionDto["action"],
      version: revision.version,
      createdAt: iso(revision.createdAt),
      snapshot: revision.snapshot,
    }));
}

function scopeFor(debts: { fromId: string; toId: string; amount: number }[], selfId: string, roster: PersonDto[], personIds: string[]): BalanceScope {
  const named: DebtDto[] = debts.map((debt) => ({
    ...debt,
    fromName: nameOf(roster, debt.fromId),
    toName: nameOf(roster, debt.toId),
  }));
  const simplified = simplifyNets(netsFromDebts(personIds, debts)).map((debt) => ({
    ...debt,
    fromName: nameOf(roster, debt.fromId),
    toName: nameOf(roster, debt.toId),
  }));
  return {
    youOwe: named.filter((debt) => debt.fromId === selfId),
    youAreOwed: named.filter((debt) => debt.toId === selfId),
    others: named.filter((debt) => debt.fromId !== selfId && debt.toId !== selfId),
    simplified,
  };
}

export async function ensureSelf(userId: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), eq(people.isSelf, true)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(people)
    .values({ id: `self-${userId}`, userId, name: "You", isSelf: true })
    .returning();
  return created;
}

async function requirePeople(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = await getDb()
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, userId), inArray(people.id, unique)));
  if (rows.length !== unique.length) throw new ShareInputError("One of those people is not in the book.");
}

async function loadJoinedGroup(userId: string, groupId: string, ownerId: string): Promise<JoinedGroup | null> {
  const db = getDb();
  const [group] = await db.select().from(groups).where(and(eq(groups.id, groupId), eq(groups.userId, ownerId))).limit(1);
  if (!group) return null;
  const [ownerAccount] = await db.select({ name: user.name }).from(user).where(eq(user.id, ownerId)).limit(1);
  const ownerName = ownerAccount?.name ?? "Someone";
  const ownerPeople = await db.select().from(people).where(eq(people.userId, ownerId));
  const mine = ownerPeople.find((person) => person.linkedUserId === userId);
  if (!mine) return null;
  const roster: PersonDto[] = ownerPeople
    .map((person) => ({
      id: person.id,
      name: person.id === mine.id ? "You" : person.isSelf ? ownerName : person.name,
      isSelf: person.id === mine.id,
      linkedUserId: person.linkedUserId ?? (person.isSelf ? ownerId : null),
    }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name));
  const memberRows = await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  const expenseRows = await db
    .select()
    .from(sharedExpenses)
    .where(and(eq(sharedExpenses.userId, ownerId), eq(sharedExpenses.groupId, groupId)));
  const expenseIds = expenseRows.map((expense) => expense.id);
  const splitRows = expenseIds.length ? await db.select().from(sharedSplits).where(inArray(sharedSplits.expenseId, expenseIds)) : [];
  const revisionRows = expenseIds.length
    ? await db
        .select()
        .from(sharedExpenseRevisions)
        .where(and(eq(sharedExpenseRevisions.ownerUserId, ownerId), inArray(sharedExpenseRevisions.expenseId, expenseIds)))
        .orderBy(desc(sharedExpenseRevisions.createdAt), desc(sharedExpenseRevisions.version))
    : [];
  const settlementRows = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.userId, ownerId), eq(settlements.groupId, groupId)));
  const accountNames = await loadUserNames([
    ...expenseRows.flatMap((expense) => [expense.createdByUserId, expense.updatedByUserId]),
    ...settlementRows.flatMap((settlement) => [settlement.createdByUserId, settlement.updatedByUserId]),
  ]);

  const debts = pairwiseDebts(
    expenseRows.map((expense) => ({
      groupId: expense.groupId,
      paidById: expense.paidById,
      splits: splitRows.filter((split) => split.expenseId === expense.id).map((split) => ({ personId: split.personId, amount: split.amount })),
    })),
    settlementRows.map((settlement) => ({
      groupId: settlement.groupId,
      fromPersonId: settlement.fromPersonId,
      toPersonId: settlement.toPersonId,
      amount: settlement.amount,
    })),
    groupId,
  );
  const members = memberRows
    .map((member) => roster.find((person) => person.id === member.personId))
    .filter((person): person is PersonDto => Boolean(person))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name));
  const involved = new Set(members.map((member) => member.id));
  for (const debt of debts) {
    involved.add(debt.fromId);
    involved.add(debt.toId);
  }
  const visible = roster.filter((person) => involved.has(person.id));

  const kind: GroupKind = group.kind === "direct" ? "direct" : "group";
  return {
    id: group.id,
    name: kind === "direct" ? ownerName : group.name,
    kind,
    ownerName,
    members,
    people: visible,
    self: { id: mine.id, name: "You", isSelf: true, linkedUserId: userId },
    balances: scopeFor(debts, mine.id, roster, [...involved]),
    expenses: expenseRows
      .map((expense) => ({
        id: expense.id,
        groupId: expense.groupId,
        groupName: group.kind === "direct" ? ownerName : group.name,
        description: expense.description,
        date: expense.date,
        amount: expense.amount,
        paidById: expense.paidById,
        paidByName: nameOf(roster, expense.paidById),
        splitMode: expense.splitMode as SplitMode,
        category: expense.category,
        note: expense.note,
        createdByName: expense.createdByUserId ? accountNames.get(expense.createdByUserId) ?? null : null,
        updatedByName: expense.updatedByUserId ? accountNames.get(expense.updatedByUserId) ?? null : null,
        version: expense.version,
        createdAt: iso(expense.createdAt),
        updatedAt: iso(expense.updatedAt),
        revisions: revisionsFor(expense.id, revisionRows),
        splits: splitRows
          .filter((split) => split.expenseId === expense.id)
          .map((split) => ({ personId: split.personId, name: nameOf(roster, split.personId), amount: split.amount, weight: split.weight })),
        transactionIds: [],
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    settlements: settlementRows
      .map((settlement) => ({
        id: settlement.id,
        groupId: settlement.groupId,
        groupName: group.kind === "direct" ? ownerName : group.name,
        fromPersonId: settlement.fromPersonId,
        toPersonId: settlement.toPersonId,
        fromName: nameOf(roster, settlement.fromPersonId),
        toName: nameOf(roster, settlement.toPersonId),
        amount: settlement.amount,
        date: settlement.date,
        note: settlement.note,
        createdByName: settlement.createdByUserId ? accountNames.get(settlement.createdByUserId) ?? null : null,
        updatedByName: settlement.updatedByUserId ? accountNames.get(settlement.updatedByUserId) ?? null : null,
        version: settlement.version,
        createdAt: iso(settlement.createdAt),
        updatedAt: iso(settlement.updatedAt),
        transaction: null,
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
  };
}

export async function getShareBook(userId: string): Promise<ShareBook> {
  const selfRow = await ensureSelf(userId);
  const db = getDb();
  const personRows = await db.select().from(people).where(eq(people.userId, userId));
  const roster: PersonDto[] = personRows
    .map((person) => ({ id: person.id, name: person.name, isSelf: person.isSelf, linkedUserId: person.linkedUserId }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name));
  const groupRows = await db.select().from(groups).where(eq(groups.userId, userId));
  const groupIds = groupRows.map((group) => group.id);
  const memberRows = groupIds.length ? await db.select().from(groupMembers).where(inArray(groupMembers.groupId, groupIds)) : [];
  const expenseRows = await db.select().from(sharedExpenses).where(eq(sharedExpenses.userId, userId));
  const expenseIds = expenseRows.map((expense) => expense.id);
  const splitRows = expenseIds.length ? await db.select().from(sharedSplits).where(inArray(sharedSplits.expenseId, expenseIds)) : [];
  const revisionRows = expenseIds.length
    ? await db
        .select()
        .from(sharedExpenseRevisions)
        .where(and(eq(sharedExpenseRevisions.ownerUserId, userId), inArray(sharedExpenseRevisions.expenseId, expenseIds)))
        .orderBy(desc(sharedExpenseRevisions.createdAt), desc(sharedExpenseRevisions.version))
    : [];
  const linkRows = expenseIds.length
    ? await db.select().from(expenseTransactions).where(inArray(expenseTransactions.expenseId, expenseIds))
    : [];
  const settlementRows = await db.select().from(settlements).where(eq(settlements.userId, userId));
  const accountNames = await loadUserNames([
    ...expenseRows.flatMap((expense) => [expense.createdByUserId, expense.updatedByUserId]),
    ...settlementRows.flatMap((settlement) => [settlement.createdByUserId, settlement.updatedByUserId]),
  ]);
  const linkedIds = [
    ...new Set([
      ...linkRows.map((link) => link.transactionId),
      ...settlementRows.map((settlement) => settlement.transactionId).filter((id): id is string => Boolean(id)),
    ]),
  ];
  const bankRows = linkedIds.length
    ? await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.userId, userId), inArray(transactions.id, linkedIds)))
    : [];
  const bankById = new Map(bankRows.map((row) => [row.id, row]));

  const expensesForBalance: ExpenseForBalance[] = expenseRows.map((expense) => ({
    groupId: expense.groupId,
    paidById: expense.paidById,
    splits: splitRows.filter((split) => split.expenseId === expense.id).map((split) => ({ personId: split.personId, amount: split.amount })),
  }));
  const settlementsForBalance: SettlementForBalance[] = settlementRows.map((settlement) => ({
    groupId: settlement.groupId,
    fromPersonId: settlement.fromPersonId,
    toPersonId: settlement.toPersonId,
    amount: settlement.amount,
  }));

  const self = { id: selfRow.id, name: selfRow.name, isSelf: true, linkedUserId: selfRow.linkedUserId };
  const overallDebts = pairwiseDebts(expensesForBalance, settlementsForBalance);
  const groupDtos = groupRows
    .map((group) => {
      const members = memberRows
        .filter((member) => member.groupId === group.id)
        .map((member) => roster.find((person) => person.id === member.personId))
        .filter((person): person is PersonDto => Boolean(person))
        .sort((a, b) => a.name.localeCompare(b.name));
      const debts = pairwiseDebts(expensesForBalance, settlementsForBalance, group.id);
      const involved = new Set(members.map((member) => member.id));
      for (const debt of debts) {
        involved.add(debt.fromId);
        involved.add(debt.toId);
      }
      const kind: GroupKind = group.kind === "direct" ? "direct" : "group";
      return {
        id: group.id,
        name: kind === "direct" ? (members.find((member) => !member.isSelf)?.name ?? "Direct") : group.name,
        kind,
        members,
        balances: scopeFor(debts, self.id, roster, [...involved]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const groupName = new Map(groupDtos.map((group) => [group.id, group.name]));
  const expenses = expenseRows
    .map((expense) => ({
      id: expense.id,
      groupId: expense.groupId,
      groupName: expense.groupId ? groupName.get(expense.groupId) ?? null : null,
      description: expense.description,
      date: expense.date,
      amount: expense.amount,
      paidById: expense.paidById,
      paidByName: nameOf(roster, expense.paidById),
      splitMode: expense.splitMode as SplitMode,
      category: expense.category,
      note: expense.note,
      createdByName: expense.createdByUserId ? accountNames.get(expense.createdByUserId) ?? null : null,
      updatedByName: expense.updatedByUserId ? accountNames.get(expense.updatedByUserId) ?? null : null,
      version: expense.version,
      createdAt: iso(expense.createdAt),
      updatedAt: iso(expense.updatedAt),
      revisions: revisionsFor(expense.id, revisionRows),
      splits: splitRows
        .filter((split) => split.expenseId === expense.id)
        .map((split) => ({
          personId: split.personId,
          name: nameOf(roster, split.personId),
          amount: split.amount,
          weight: split.weight,
        })),
      transactionIds: linkRows.filter((link) => link.expenseId === expense.id).map((link) => link.transactionId),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const settlementDtos = settlementRows
    .map((settlement) => {
      const bank = settlement.transactionId ? bankById.get(settlement.transactionId) : undefined;
      return {
        id: settlement.id,
        groupId: settlement.groupId,
        groupName: settlement.groupId ? groupName.get(settlement.groupId) ?? null : null,
        fromPersonId: settlement.fromPersonId,
        toPersonId: settlement.toPersonId,
        fromName: nameOf(roster, settlement.fromPersonId),
        toName: nameOf(roster, settlement.toPersonId),
        amount: settlement.amount,
        date: settlement.date,
        note: settlement.note,
        createdByName: settlement.createdByUserId ? accountNames.get(settlement.createdByUserId) ?? null : null,
        updatedByName: settlement.updatedByUserId ? accountNames.get(settlement.updatedByUserId) ?? null : null,
        version: settlement.version,
        createdAt: iso(settlement.createdAt),
        updatedAt: iso(settlement.updatedAt),
        transaction: bank
          ? { id: bank.id, merchant: bank.merchant, amount: bank.amount, account: bank.account, date: bank.date, type: bank.type }
          : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const links = [
    ...settlementDtos
      .filter((settlement) => settlement.transaction)
      .map((settlement) => ({
        transactionId: settlement.transaction!.id,
        kind: "settlement" as const,
        title: `${settlement.fromName} paid ${settlement.toName}`,
        shareAmount: settlement.amount,
        bankAmount: settlement.transaction!.amount,
        detail: settlement.note,
      })),
    ...expenses.flatMap((expense) =>
      expense.transactionIds.map((transactionId) => {
        const bank = bankById.get(transactionId);
        return {
          transactionId,
          kind: "expense" as const,
          title: expense.description,
          shareAmount: expense.amount,
          bankAmount: bank?.amount ?? null,
          detail: expense.note,
        };
      }),
    ),
  ];

  const accessRows = await db
    .select()
    .from(groupUserAccess)
    .where(and(eq(groupUserAccess.userId, userId), eq(groupUserAccess.role, "member")));
  const joinedGroups = (await Promise.all(accessRows.map((access) => loadJoinedGroup(userId, access.groupId, access.ownerUserId)))).filter(
    (group): group is JoinedGroup => group !== null,
  );

  return {
    self,
    people: roster,
    groups: groupDtos,
    joinedGroups: joinedGroups.sort((a, b) => a.name.localeCompare(b.name)),
    overall: scopeFor(overallDebts, self.id, roster, roster.map((person) => person.id)),
    expenses,
    settlements: settlementDtos,
    links,
  };
}

export async function createPerson(userId: string, name: string) {
  const [row] = await getDb()
    .insert(people)
    .values({ id: crypto.randomUUID(), userId, name, isSelf: false })
    .returning();
  return { id: row.id, name: row.name, isSelf: row.isSelf };
}

export async function renamePerson(userId: string, id: string, name: string) {
  const [row] = await getDb()
    .update(people)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .returning();
  if (!row) throw new NotFoundError("That person is not in the book.");
  return { id: row.id, name: row.name, isSelf: row.isSelf };
}

export async function deletePerson(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .limit(1);
  if (!row) throw new NotFoundError("That person is not in the book.");
  if (row.isSelf) throw new ShareInputError("You stay in the book. Rename yourself instead.");
  try {
    await getDb().transaction(async (tx) => {
      if (row.linkedUserId) {
        const owned = tx.select({ id: groups.id }).from(groups).where(eq(groups.userId, userId));
        await tx
          .delete(groupUserAccess)
          .where(and(eq(groupUserAccess.userId, row.linkedUserId), eq(groupUserAccess.role, "member"), inArray(groupUserAccess.groupId, owned)));
      }
      // The hidden two-person book behind this friendship goes with them.
      const direct = await tx
        .select({ id: groups.id })
        .from(groups)
        .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
        .where(and(eq(groups.userId, userId), eq(groups.kind, "direct"), eq(groupMembers.personId, id)));
      if (direct.length) {
        await tx.delete(groups).where(
          and(
            eq(groups.userId, userId),
            inArray(
              groups.id,
              direct.map((group) => group.id),
            ),
          ),
        );
      }
      await tx.delete(people).where(and(eq(people.id, id), eq(people.userId, userId)));
    });
  } catch (error) {
    if (pgCode(error) === "23503") {
      throw new ShareInputError("This person still has a shared expense or a settlement. Clear those first.");
    }
    throw error;
  }
}

export async function createGroup(userId: string, name: string, memberIds: string[]) {
  const unique = [...new Set(memberIds)];
  await requirePeople(userId, unique);
  const id = crypto.randomUUID();
  await getDb().transaction(async (tx) => {
    await tx.insert(groups).values({ id, userId, name });
    await tx.insert(groupMembers).values(unique.map((personId) => ({ groupId: id, personId })));
    await tx.insert(groupUserAccess).values({ groupId: id, userId, ownerUserId: userId, role: "owner" });
  });
  return id;
}

/**
 * The hidden two-person book between you and one friend. Expenses added "with a
 * friend" live here, so the friend sees them as soon as they have an account.
 * Created on first use. If the friend already has an account the access row is
 * granted right away.
 */
export async function ensureDirectGroup(userId: string, personId: string) {
  const self = await ensureSelf(userId);
  const db = getDb();
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .limit(1);
  if (!person) throw new NotFoundError("That person is not in the book.");
  if (person.isSelf) throw new ShareInputError("You cannot be your own friend.");

  const existing = await db
    .select({ id: groups.id })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(and(eq(groups.userId, userId), eq(groups.kind, "direct"), eq(groupMembers.personId, personId)))
    .limit(1);
  const groupId = existing[0]?.id ?? crypto.randomUUID();

  await db.transaction(async (tx) => {
    if (!existing[0]) {
      await tx.insert(groups).values({ id: groupId, userId, name: "Direct", kind: "direct" });
      await tx.insert(groupMembers).values([
        { groupId, personId: self.id },
        { groupId, personId },
      ]);
      await tx.insert(groupUserAccess).values({ groupId, userId, ownerUserId: userId, role: "owner" });
    }
    if (person.linkedUserId) {
      await tx
        .insert(groupUserAccess)
        .values({ groupId, userId: person.linkedUserId, ownerUserId: userId, role: "member" })
        .onConflictDoNothing();
    }
  });
  return groupId;
}

export async function updateGroup(userId: string, id: string, input: { name?: string; memberIds?: string[] }) {
  const [group] = await getDb()
    .select()
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .limit(1);
  if (!group) throw new NotFoundError("That group is not in the book.");
  // The hidden two-person book is defined by its two members; editing it would
  // turn a friendship into an unlisted group the friend never agreed to.
  if (group.kind === "direct") throw new ShareInputError("A friend's book cannot be renamed or given other members.");
  const unique = input.memberIds ? [...new Set(input.memberIds)] : undefined;
  if (unique) await requirePeople(userId, unique);
  await getDb().transaction(async (tx) => {
    if (input.name) {
      await tx
        .update(groups)
        .set({ name: input.name, updatedAt: new Date() })
        .where(and(eq(groups.id, id), eq(groups.userId, userId)));
    }
    if (unique) {
      await tx.delete(groupMembers).where(eq(groupMembers.groupId, id));
      if (unique.length) {
        await tx.insert(groupMembers).values(unique.map((personId) => ({ groupId: id, personId })));
      }
      // Revoke access for any linked account whose person row is no longer a
      // member of this group. Without this, removing someone from the member
      // list leaves their Khata account able to read and write the group.
      const keepRows = unique.length
        ? await tx
            .select({ linkedUserId: people.linkedUserId })
            .from(people)
            .where(and(eq(people.userId, userId), inArray(people.id, unique)))
        : [];
      const keepUserIds = keepRows.map((row) => row.linkedUserId).filter((value): value is string => Boolean(value));
      await tx
        .delete(groupUserAccess)
        .where(
          and(
            eq(groupUserAccess.groupId, id),
            eq(groupUserAccess.role, "member"),
            keepUserIds.length ? notInArray(groupUserAccess.userId, keepUserIds) : undefined,
          ),
        );
    }
  });
}

export async function leaveGroup(userId: string, groupId: string) {
  const [access] = await getDb()
    .select({ ownerUserId: groupUserAccess.ownerUserId })
    .from(groupUserAccess)
    .where(and(eq(groupUserAccess.groupId, groupId), eq(groupUserAccess.userId, userId), eq(groupUserAccess.role, "member")))
    .limit(1);
  if (!access) throw new NotFoundError("That group membership was not found.");

  const group = await loadJoinedGroup(userId, groupId, access.ownerUserId);
  if (!group) throw new NotFoundError("That group membership was not found.");
  if (group.balances.youOwe.length || group.balances.youAreOwed.length) {
    throw new ShareInputError("Settle your open balance before leaving this group.");
  }

  const [removed] = await getDb()
    .delete(groupUserAccess)
    .where(and(eq(groupUserAccess.groupId, groupId), eq(groupUserAccess.userId, userId), eq(groupUserAccess.role, "member")))
    .returning({ groupId: groupUserAccess.groupId });
  if (!removed) throw new NotFoundError("That group membership was not found.");
}

export async function deleteGroup(userId: string, id: string) {
  const db = getDb();
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .limit(1);
  if (!group) throw new NotFoundError("That group is not in the book.");
  await db.transaction(async (tx) => {
    // Remove the group's own data instead of orphaning it. Deleting the group
    // alone would leave its expenses and settlements behind with a null
    // group_id, still counted in the overall balances. splits and expense
    // links cascade from shared_expenses; members, access, and invites cascade
    // from the group row.
    await tx.delete(sharedExpenses).where(and(eq(sharedExpenses.userId, userId), eq(sharedExpenses.groupId, id)));
    await tx.delete(settlements).where(and(eq(settlements.userId, userId), eq(settlements.groupId, id)));
    await tx.delete(groups).where(and(eq(groups.id, id), eq(groups.userId, userId)));
  });
}

async function assertExpenseLinks(userId: string, transactionIds: string[], exceptExpenseId?: string) {
  const unique = [...new Set(transactionIds)];
  if (unique.length === 0) return unique;
  const rows = await getDb()
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.id, unique)));
  if (rows.length !== unique.length) throw new ShareInputError("One of those bank lines is not in the ledger.");
  const usedBySettlement = await getDb()
    .select({ id: settlements.id })
    .from(settlements)
    .where(and(eq(settlements.userId, userId), inArray(settlements.transactionId, unique)));
  if (usedBySettlement.length) throw new ShareInputError("That bank line is already linked to a settlement.");
  const usedByExpense = await getDb().select().from(expenseTransactions).where(inArray(expenseTransactions.transactionId, unique));
  if (usedByExpense.some((link) => link.expenseId !== exceptExpenseId)) {
    throw new ShareInputError("That bank line is already linked to a shared expense.");
  }
  return unique;
}

type Scope = { ownerId: string; isOwner: boolean };

async function memberAccess(actorId: string, groupId: string) {
  const [access] = await getDb()
    .select()
    .from(groupUserAccess)
    .where(and(eq(groupUserAccess.groupId, groupId), eq(groupUserAccess.userId, actorId), eq(groupUserAccess.role, "member")))
    .limit(1);
  return access ?? null;
}

async function groupScope(actorId: string, groupId: string | null | undefined): Promise<Scope> {
  if (!groupId) return { ownerId: actorId, isOwner: true };
  const [group] = await getDb().select({ userId: groups.userId }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (group?.userId === actorId) return { ownerId: actorId, isOwner: true };
  const access = group?.userId ? await memberAccess(actorId, groupId) : null;
  if (!access || access.ownerUserId !== group?.userId) throw new ShareInputError("That group is not in the book.");
  return { ownerId: access.ownerUserId, isOwner: false };
}

async function requireGroupMembers(groupId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = await getDb()
    .select({ id: groupMembers.personId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.personId, unique)));
  if (rows.length !== unique.length) throw new ShareInputError("Everyone in a shared group entry must be a member of that group.");
}

async function rowScope(actorId: string, row: { userId: string; groupId: string | null }): Promise<Scope | null> {
  if (row.userId === actorId) return { ownerId: actorId, isOwner: true };
  if (!row.groupId) return null;
  const access = await memberAccess(actorId, row.groupId);
  return access && access.ownerUserId === row.userId ? { ownerId: row.userId, isOwner: false } : null;
}

async function mutationScope(
  actorId: string,
  row: { userId: string; groupId: string | null; createdByUserId: string | null },
): Promise<Scope | null> {
  const scope = await rowScope(actorId, row);
  if (!scope || (!scope.isOwner && row.createdByUserId !== actorId)) return null;
  return scope;
}

async function expenseRevision(
  actorId: string,
  expense: typeof sharedExpenses.$inferSelect,
  action: "updated" | "deleted",
) {
  const [payer] = await getDb()
    .select({ name: people.name, isSelf: people.isSelf })
    .from(people)
    .where(and(eq(people.id, expense.paidById), eq(people.userId, expense.userId)))
    .limit(1);
  const names = await loadUserNames([actorId, expense.userId]);
  const paidByName = payer?.isSelf ? names.get(expense.userId) ?? payer.name : payer?.name ?? "Someone";
  return {
    id: crypto.randomUUID(),
    expenseId: expense.id,
    ownerUserId: expense.userId,
    groupId: expense.groupId,
    actorUserId: actorId,
    actorName: names.get(actorId) ?? "Someone",
    action,
    version: expense.version,
    snapshot: {
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      paidByName,
      splitMode: expense.splitMode,
      category: expense.category,
      note: expense.note,
    },
  };
}

async function writeExpense(
  actorId: string,
  id: string,
  input: {
    description: string;
    date: string;
    amount: number;
    paidById: string;
    groupId?: string | null;
    splitMode: SplitMode;
    category?: string | null;
    note: string;
    participants: { personId: string; amount?: number; weight?: number }[];
    transactionIds: string[];
    version?: number;
  },
  existing: typeof sharedExpenses.$inferSelect | null,
) {
  const personIds = [input.paidById, ...input.participants.map((participant) => participant.personId)];
  let scope: Scope;
  if (existing) {
    const current = await mutationScope(actorId, existing);
    if (!current) throw new NotFoundError("That shared expense is not in the book.");
    if (input.version === undefined) throw new ShareInputError("Include the current version to update this shared expense.");
    if (input.version !== existing.version) {
      throw new ConflictError("This shared expense changed since you opened it. Refresh it and try again.");
    }
    if (current.isOwner) {
      const requested = await groupScope(actorId, input.groupId);
      if (!requested.isOwner || requested.ownerId !== existing.userId) {
        throw new ShareInputError("An expense can only be moved within its owner's ledger.");
      }
      scope = requested;
    } else if ((input.groupId ?? null) === existing.groupId) {
      scope = current;
    } else {
      throw new ShareInputError("Only the group owner can move an expense to another group.");
    }
  } else {
    scope = await groupScope(actorId, input.groupId);
  }
  await requirePeople(scope.ownerId, personIds);
  if (!scope.isOwner) {
    await requireGroupMembers(input.groupId!, personIds);
    if (input.transactionIds.length) throw new ShareInputError("Bank lines can only be linked by the person who owns that ledger.");
  }
  const splits = buildSplits({
    mode: input.splitMode,
    total: input.amount,
    paidById: input.paidById,
    participants: input.participants,
  });
  const links = scope.isOwner ? await assertExpenseLinks(scope.ownerId, input.transactionIds, existing ? id : undefined) : [];
  const revision = existing ? await expenseRevision(actorId, existing, "updated") : null;
  const now = new Date();
  await getDb().transaction(async (tx) => {
    if (existing) {
      await tx.insert(sharedExpenseRevisions).values(revision!);
      const [updated] = await tx
        .update(sharedExpenses)
        .set({
          groupId: input.groupId ?? null,
          description: input.description,
          date: input.date,
          amount: input.amount,
          paidById: input.paidById,
          splitMode: input.splitMode,
          category: input.category ?? null,
          note: input.note,
          updatedByUserId: actorId,
          version: sql`${sharedExpenses.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(sharedExpenses.id, id), eq(sharedExpenses.userId, existing.userId), eq(sharedExpenses.version, input.version!)))
        .returning();
      if (!updated) throw new ConflictError("This shared expense changed since you opened it. Refresh it and try again.");
      await tx.delete(sharedSplits).where(eq(sharedSplits.expenseId, id));
      if (scope.isOwner) await tx.delete(expenseTransactions).where(eq(expenseTransactions.expenseId, id));
    } else {
      await tx.insert(sharedExpenses).values({
        id,
        userId: scope.ownerId,
        groupId: input.groupId ?? null,
        createdByUserId: actorId,
        updatedByUserId: actorId,
        description: input.description,
        date: input.date,
        amount: input.amount,
        currency: "NPR",
        paidById: input.paidById,
        splitMode: input.splitMode,
        category: input.category ?? null,
        note: input.note,
      });
    }
    await tx.insert(sharedSplits).values(
      splits.map((split) => ({
        expenseId: id,
        personId: split.personId,
        amount: split.amount,
        weight: split.weight,
      })),
    );
    if (links.length) {
      await tx.insert(expenseTransactions).values(links.map((transactionId) => ({ expenseId: id, transactionId })));
    }
  });
  return id;
}

type ExpenseInput = Parameters<typeof writeExpense>[2];

export type SharedWriteActivity =
  | {
      kind: "expense";
      action: "added" | "updated" | "deleted";
      expenseId: string;
    }
  | {
      kind: "settlement";
      action: "recorded" | "updated" | "deleted";
      settlementId: string;
    };

/**
 * Notification detail for a shared write, read after the write committed: the
 * recipient accounts plus the rendered activity (actor name, deep-link URL,
 * dedupe tag). Routes pass the result straight to `notifySharedWrite`.
 *
 * Reads post-commit so creates, version-checked updates, and deletes all share
 * one path; a row that no longer resolves (deleted, or a join the owner never
 * sees as their own group) yields null and the route skips the push.
 */
export async function describeSharedWrite(
  actorId: string,
  activity: SharedWriteActivity,
): Promise<{ actorId: string; ownerId: string; groupId: string | null; personIds: string[]; activity: SharedActivity } | null> {
  if (activity.kind === "expense") return describeExpenseWrite(actorId, activity.expenseId, activity.action);
  return describeSettlementWrite(actorId, activity.settlementId, activity.action);
}

async function describeExpenseWrite(
  actorId: string,
  expenseId: string,
  action: "added" | "updated" | "deleted",
): Promise<{ actorId: string; ownerId: string; groupId: string | null; personIds: string[]; activity: SharedActivity } | null> {
  if (action === "deleted") return describeDeletedExpense(actorId, expenseId);
  const [expense] = await getDb().select().from(sharedExpenses).where(eq(sharedExpenses.id, expenseId)).limit(1);
  if (!expense) return null;
  const group = expense.groupId ? await groupLabel(expense.userId, expense.groupId) : null;
  if (expense.groupId && !group) return null;
  const url = writeUrl("expense", group);
  const [actorName, splits] = await Promise.all([
    displayName(actorId),
    getDb().select({ personId: sharedSplits.personId }).from(sharedSplits).where(eq(sharedSplits.expenseId, expenseId)),
  ]);
  return {
    actorId,
    ownerId: expense.userId,
    groupId: expense.groupId,
    personIds: [...new Set([expense.paidById, ...splits.map((split) => split.personId)])],
    activity: {
      kind: "expense",
      action,
      actorName,
      description: expense.description,
      amount: expense.amount,
      title: group?.title ?? "Shared expense",
      url,
      tag: `khata-expense-${expenseId}`,
    },
  };
}

/** Deletes remove the row, so rebuild the push from the latest audit snapshot. */
async function describeDeletedExpense(
  actorId: string,
  expenseId: string,
): Promise<{ actorId: string; ownerId: string; groupId: string | null; personIds: string[]; activity: SharedActivity } | null> {
  const [revision] = await getDb()
    .select()
    .from(sharedExpenseRevisions)
    .where(eq(sharedExpenseRevisions.expenseId, expenseId))
    .orderBy(desc(sharedExpenseRevisions.createdAt))
    .limit(1);
  if (!revision || revision.action !== "deleted") return null;
  const group = revision.groupId ? await groupLabel(revision.ownerUserId, revision.groupId) : null;
  if (revision.groupId && !group) return null;
  const url = writeUrl("expense", group);
  const actorName = await displayName(actorId);
  return {
    actorId,
    ownerId: revision.ownerUserId,
    groupId: revision.groupId,
    personIds: await expenseSnapshotPersonIds(revision.ownerUserId, revision.groupId),
    activity: {
      kind: "expense",
      action: "deleted",
      actorName,
      description: revision.snapshot.description,
      amount: revision.snapshot.amount,
      title: group?.title ?? "Shared expense",
      url,
      tag: `khata-expense-${expenseId}`,
    },
  };
}

async function describeSettlementWrite(
  actorId: string,
  settlementId: string,
  action: "recorded" | "updated" | "deleted",
): Promise<{ actorId: string; ownerId: string; groupId: string | null; personIds: string[]; activity: SharedActivity } | null> {
  const [settlement] = await getDb().select().from(settlements).where(eq(settlements.id, settlementId)).limit(1);
  // Settlements keep no audit trail, so a delete has nothing to describe.
  if (!settlement) return null;
  const group = settlement.groupId ? await groupLabel(settlement.userId, settlement.groupId) : null;
  if (settlement.groupId && !group) return null;
  const url = writeUrl("settlement", group);
  const [actorName, payerName, receiverName] = await Promise.all([
    displayName(actorId),
    personLabel(settlement.userId, settlement.fromPersonId),
    personLabel(settlement.userId, settlement.toPersonId),
  ]);
  return {
    actorId,
    ownerId: settlement.userId,
    groupId: settlement.groupId,
    personIds: [settlement.fromPersonId, settlement.toPersonId],
    activity: {
      kind: "settlement",
      action,
      actorName,
      payerName,
      receiverName,
      amount: settlement.amount,
      title: group?.title ?? "Settlement",
      url,
      tag: `khata-settlement-${settlementId}`,
    },
  };
}

/** People who could be affected by a deleted expense: its group, or the whole book. */
async function expenseSnapshotPersonIds(ownerId: string, groupId: string | null): Promise<string[]> {
  if (!groupId) {
    const rows = await getDb().select({ id: people.id }).from(people).where(eq(people.userId, ownerId));
    return rows.map((row) => row.id);
  }
  const rows = await getDb().select({ personId: groupMembers.personId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
  return rows.map((row) => row.personId);
}

type GroupLabel = { title: string; path: string };

async function groupLabel(ownerId: string, groupId: string): Promise<GroupLabel | null> {
  const [group] = await getDb()
    .select({ name: groups.name, kind: groups.kind })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.userId, ownerId)))
    .limit(1);
  if (!group) return null;
  if (group.kind === "direct") {
    const [owner] = await getDb().select({ name: user.name }).from(user).where(eq(user.id, ownerId)).limit(1);
    return { title: owner?.name ?? "Shared expense", path: `/friends/${encodeURIComponent(groupId)}` };
  }
  return { title: group.name, path: `/groups/${encodeURIComponent(groupId)}` };
}

function writeUrl(kind: "expense" | "settlement", group: GroupLabel | null): string {
  if (!group) return kind === "expense" ? "/friends" : "/balances";
  return group.path;
}

async function displayName(userId: string): Promise<string> {
  const [account] = await getDb().select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return account?.name?.trim() || "Someone";
}

async function personLabel(ownerId: string, personId: string): Promise<string> {
  const [person] = await getDb()
    .select({ name: people.name, isSelf: people.isSelf })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, ownerId)))
    .limit(1);
  if (!person) return "Someone";
  if (person.isSelf) return (await displayName(ownerId)) || "You";
  return person.name;
}

export async function createSharedExpense(userId: string, input: ExpenseInput) {
  return writeExpense(userId, crypto.randomUUID(), input, null);
}

export async function updateSharedExpense(userId: string, id: string, input: ExpenseInput) {
  const [existing] = await getDb()
    .select()
    .from(sharedExpenses)
    .where(eq(sharedExpenses.id, id))
    .limit(1);
  if (!existing) throw new NotFoundError("That shared expense is not in the book.");
  return writeExpense(userId, id, input, existing);
}

export async function deleteSharedExpense(userId: string, id: string) {
  const [existing] = await getDb().select().from(sharedExpenses).where(eq(sharedExpenses.id, id)).limit(1);
  const scope = existing ? await mutationScope(userId, existing) : null;
  if (!existing || !scope) throw new NotFoundError("That shared expense is not in the book.");
  const revision = await expenseRevision(userId, existing, "deleted");
  await getDb().transaction(async (tx) => {
    await tx.insert(sharedExpenseRevisions).values(revision);
    const [deleted] = await tx
      .delete(sharedExpenses)
      .where(and(eq(sharedExpenses.id, id), eq(sharedExpenses.userId, scope.ownerId), eq(sharedExpenses.version, existing.version)))
      .returning({ id: sharedExpenses.id });
    if (!deleted) throw new ConflictError("This shared expense changed just before deletion. Refresh it and try again.");
  });
}

type SettlementInput = {
  fromPersonId: string;
  toPersonId: string;
  amount: number;
  date: string;
  groupId?: string | null;
  note: string;
  transactionId?: string | null;
  version?: number;
};

async function settlementWriteScope(
  actorId: string,
  input: SettlementInput,
  existing: typeof settlements.$inferSelect | null,
): Promise<Scope> {
  if (!existing) return groupScope(actorId, input.groupId);
  const current = await mutationScope(actorId, existing);
  if (!current) throw new NotFoundError("That settlement is not in the book.");
  if (!current.isOwner) {
    if ((input.groupId ?? null) !== existing.groupId) {
      throw new ShareInputError("Only the group owner can move a settlement to another group.");
    }
    return current;
  }
  const requested = await groupScope(actorId, input.groupId);
  if (!requested.isOwner || requested.ownerId !== existing.userId) {
    throw new ShareInputError("A settlement can only be moved within its owner's ledger.");
  }
  return requested;
}

async function validateSettlementWrite(
  scope: Scope,
  input: SettlementInput,
  exceptSettlementId?: string,
) {
  if (input.fromPersonId === input.toPersonId) throw new ShareInputError("A settlement needs two different people.");
  await requirePeople(scope.ownerId, [input.fromPersonId, input.toPersonId]);
  const transactionId = input.transactionId ?? null;
  if (!scope.isOwner) {
    await requireGroupMembers(input.groupId!, [input.fromPersonId, input.toPersonId]);
    if (transactionId) throw new ShareInputError("Bank lines can only be linked by the person who owns that ledger.");
  }
  if (transactionId) {
    const [bank] = await getDb()
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, scope.ownerId)))
      .limit(1);
    if (!bank) throw new ShareInputError("That bank line is not in the ledger.");
    const [expenseLink] = await getDb()
      .select({ expenseId: expenseTransactions.expenseId })
      .from(expenseTransactions)
      .where(eq(expenseTransactions.transactionId, transactionId))
      .limit(1);
    if (expenseLink) throw new ShareInputError("That bank line is already linked to a shared expense.");
    const [other] = await getDb()
      .select({ id: settlements.id })
      .from(settlements)
      .where(and(eq(settlements.transactionId, transactionId), eq(settlements.userId, scope.ownerId)))
      .limit(1);
    if (other && other.id !== exceptSettlementId) throw new ShareInputError("That bank line is already linked to a settlement.");
  }
  return transactionId;
}

export async function createSettlement(userId: string, input: SettlementInput) {
  const scope = await settlementWriteScope(userId, input, null);
  const transactionId = await validateSettlementWrite(scope, input);
  const id = crypto.randomUUID();
  await getDb().insert(settlements).values({
    id,
    userId: scope.ownerId,
    groupId: input.groupId ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
    fromPersonId: input.fromPersonId,
    toPersonId: input.toPersonId,
    amount: input.amount,
    currency: "NPR",
    date: input.date,
    note: input.note,
    transactionId,
  });
  return id;
}

export async function updateSettlement(userId: string, id: string, input: SettlementInput) {
  const [existing] = await getDb().select().from(settlements).where(eq(settlements.id, id)).limit(1);
  if (!existing) throw new NotFoundError("That settlement is not in the book.");
  const scope = await settlementWriteScope(userId, input, existing);
  if (input.version === undefined) throw new ShareInputError("Include the current version to update this settlement.");
  if (input.version !== existing.version) {
    throw new ConflictError("This settlement changed since you opened it. Refresh it and try again.");
  }
  const transactionId = await validateSettlementWrite(scope, input, id);
  const [updated] = await getDb()
    .update(settlements)
    .set({
      groupId: input.groupId ?? null,
      fromPersonId: input.fromPersonId,
      toPersonId: input.toPersonId,
      amount: input.amount,
      date: input.date,
      note: input.note,
      transactionId,
      updatedByUserId: userId,
      version: sql`${settlements.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(settlements.id, id), eq(settlements.userId, existing.userId), eq(settlements.version, input.version)))
    .returning({ id: settlements.id });
  if (!updated) throw new ConflictError("This settlement changed since you opened it. Refresh it and try again.");
  return id;
}

export async function deleteSettlement(userId: string, id: string) {
  const [existing] = await getDb().select().from(settlements).where(eq(settlements.id, id)).limit(1);
  const scope = existing ? await mutationScope(userId, existing) : null;
  if (!existing || !scope) throw new NotFoundError("That settlement is not in the book.");
  const [deleted] = await getDb()
    .delete(settlements)
    .where(and(eq(settlements.id, id), eq(settlements.userId, scope.ownerId), eq(settlements.version, existing.version)))
    .returning({ id: settlements.id });
  if (!deleted) throw new ConflictError("This settlement changed just before deletion. Refresh it and try again.");
}

export async function seedSampleBook(userId: string) {
  const db = getDb();
  // Use user-scoped IDs so two users can both seed without colliding.
  // Every sample entity is namespaced under the userId.
  const scopedId = (raw: string) => `${raw}--${userId}`;

  await db.transaction(async (tx) => {
    // Reuse the existing "You" person for this user if it exists, otherwise
    // the scopedId for "person-self" will be the seed placeholder.
    const selfRows = await tx
      .select()
      .from(people)
      .where(and(eq(people.userId, userId), eq(people.isSelf, true)));
    const selfId = selfRows[0]?.id ?? scopedId("person-self");
    const mapId = (raw: string) => (raw === "person-self" ? selfId : scopedId(raw));

    // Upsert people (scoped IDs → only this user's rows are touched).
    for (const person of samplePeople) {
      const id = mapId(person.id);
      await tx
        .insert(people)
        .values({ id, userId, name: person.name, isSelf: person.isSelf })
        .onConflictDoUpdate({
          target: people.id,
          set: { name: person.name, isSelf: person.isSelf, updatedAt: new Date() },
          setWhere: eq(people.userId, userId),
        });
    }

    const groupId = scopedId(sampleGroup.id);
    await tx
      .insert(groups)
      .values({ id: groupId, userId, name: sampleGroup.name })
      .onConflictDoUpdate({
        target: groups.id,
        set: { name: sampleGroup.name, updatedAt: new Date() },
        setWhere: eq(groups.userId, userId),
      });
    await tx.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
    await tx.insert(groupMembers).values(sampleGroup.memberIds.map((personId) => ({ groupId, personId: mapId(personId) })));

    const externalIds = [
      ...new Set([
        ...sampleExpenses.flatMap((expense) => expense.transactionExternalIds),
        ...sampleSettlements.map((settlement) => settlement.transactionExternalId).filter((id): id is string => Boolean(id)),
      ]),
    ];
    const bankRows = externalIds.length
      ? await tx
          .select({ id: transactions.id, externalId: transactions.externalId })
          .from(transactions)
          .where(and(inArray(transactions.externalId, externalIds), eq(transactions.userId, userId)))
      : [];
    const bankId = new Map(bankRows.map((row) => [row.externalId, row.id]));

    for (const expense of sampleExpenses) {
      const expenseId = scopedId(expense.id);
      const expenseGroupId = expense.groupId ? scopedId(expense.groupId) : null;
      const paidById = mapId(expense.paidById);
      const participants = expense.participants.map((participant) => ({ ...participant, personId: mapId(participant.personId) }));
      const splits = buildSplits({
        mode: expense.splitMode,
        total: expense.amount,
        paidById,
        participants,
      });
      await tx
        .insert(sharedExpenses)
        .values({
          id: expenseId,
          userId,
          groupId: expenseGroupId,
          createdByUserId: userId,
          updatedByUserId: userId,
          description: expense.description,
          date: expense.date,
          amount: expense.amount,
          currency: "NPR",
          paidById,
          splitMode: expense.splitMode,
          note: expense.note,
        })
        .onConflictDoUpdate({
          target: sharedExpenses.id,
          set: {
            groupId: expenseGroupId,
            updatedByUserId: userId,
            description: expense.description,
            date: expense.date,
            amount: expense.amount,
            paidById,
            splitMode: expense.splitMode,
            note: expense.note,
            updatedAt: new Date(),
          },
          setWhere: eq(sharedExpenses.userId, userId),
        });
      await tx.delete(sharedSplits).where(eq(sharedSplits.expenseId, expenseId));
      await tx.insert(sharedSplits).values(
        splits.map((split) => ({
          expenseId,
          personId: split.personId,
          amount: split.amount,
          weight: split.weight,
        })),
      );
      await tx.delete(expenseTransactions).where(eq(expenseTransactions.expenseId, expenseId));
      const links = expense.transactionExternalIds.map((externalId) => bankId.get(externalId)).filter((id): id is string => Boolean(id));
      if (links.length) {
        await tx.insert(expenseTransactions).values(links.map((transactionId) => ({ expenseId, transactionId })));
      }
    }

    for (const settlement of sampleSettlements) {
      const settlementId = scopedId(settlement.id);
      const settlementGroupId = settlement.groupId ? scopedId(settlement.groupId) : null;
      const transactionId = settlement.transactionExternalId ? bankId.get(settlement.transactionExternalId) ?? null : null;
      const fromPersonId = mapId(settlement.fromPersonId);
      const toPersonId = mapId(settlement.toPersonId);
      await tx
        .insert(settlements)
        .values({
          id: settlementId,
          userId,
          groupId: settlementGroupId,
          createdByUserId: userId,
          updatedByUserId: userId,
          fromPersonId,
          toPersonId,
          amount: settlement.amount,
          currency: "NPR",
          date: settlement.date,
          note: settlement.note,
          transactionId,
        })
        .onConflictDoUpdate({
          target: settlements.id,
          set: {
            groupId: settlementGroupId,
            updatedByUserId: userId,
            fromPersonId,
            toPersonId,
            amount: settlement.amount,
            date: settlement.date,
            note: settlement.note,
            transactionId,
            updatedAt: new Date(),
          },
          setWhere: eq(settlements.userId, userId),
        });
    }
  });
}
