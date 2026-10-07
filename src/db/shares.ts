import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  expenseTransactions,
  groupMembers,
  groupUserAccess,
  groups,
  people,
  settlements,
  sharedExpenses,
  sharedSplits,
  transactions,
  user,
} from "@/db/schema";
import { sampleExpenses, sampleGroup, samplePeople, sampleSettlements } from "@/lib/sample-book";
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

type ExpenseDto = {
  id: string;
  groupId: string | null;
  groupName: string | null;
  description: string;
  date: string;
  amount: number;
  paidById: string;
  paidByName: string;
  splitMode: SplitMode;
  note: string;
  splits: { personId: string; name: string; amount: number; weight: number | null }[];
  transactionIds: string[];
};

type SettlementDto = {
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
  transaction: { id: string; merchant: string; amount: number; account: string; date: string; type: string } | null;
};

export type JoinedGroup = {
  id: string;
  name: string;
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
  const settlementRows = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.userId, ownerId), eq(settlements.groupId, groupId)));

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

  return {
    id: group.id,
    name: group.name,
    ownerName,
    members,
    people: visible,
    self: { id: mine.id, name: "You", isSelf: true, linkedUserId: userId },
    balances: scopeFor(debts, mine.id, roster, [...involved]),
    expenses: expenseRows
      .map((expense) => ({
        id: expense.id,
        groupId: expense.groupId,
        groupName: group.name,
        description: expense.description,
        date: expense.date,
        amount: expense.amount,
        paidById: expense.paidById,
        paidByName: nameOf(roster, expense.paidById),
        splitMode: expense.splitMode as SplitMode,
        note: expense.note,
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
        groupName: group.name,
        fromPersonId: settlement.fromPersonId,
        toPersonId: settlement.toPersonId,
        fromName: nameOf(roster, settlement.fromPersonId),
        toName: nameOf(roster, settlement.toPersonId),
        amount: settlement.amount,
        date: settlement.date,
        note: settlement.note,
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
  const linkRows = expenseIds.length
    ? await db.select().from(expenseTransactions).where(inArray(expenseTransactions.expenseId, expenseIds))
    : [];
  const settlementRows = await db.select().from(settlements).where(eq(settlements.userId, userId));
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
      return {
        id: group.id,
        name: group.name,
        members,
        balances: scopeFor(debts, self.id, roster, [...involved]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const groupName = new Map(groupRows.map((group) => [group.id, group.name]));
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
      note: expense.note,
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

export async function updateGroup(userId: string, id: string, input: { name?: string; memberIds?: string[] }) {
  const [group] = await getDb()
    .select()
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .limit(1);
  if (!group) throw new NotFoundError("That group is not in the book.");
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
      await tx.insert(groupMembers).values(unique.map((personId) => ({ groupId: id, personId })));
    }
  });
}

export async function deleteGroup(userId: string, id: string) {
  const [group] = await getDb()
    .delete(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .returning();
  if (!group) throw new NotFoundError("That group is not in the book.");
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
    note: string;
    participants: { personId: string; amount?: number; weight?: number }[];
    transactionIds: string[];
  },
  existing: { userId: string; groupId: string | null } | null,
) {
  const personIds = [input.paidById, ...input.participants.map((participant) => participant.personId)];
  let scope: Scope;
  if (existing) {
    const current = await rowScope(actorId, existing);
    if (!current) throw new NotFoundError("That shared expense is not in the book.");
    if (current.isOwner) scope = await groupScope(actorId, input.groupId);
    else if ((input.groupId ?? null) === existing.groupId) scope = current;
    else throw new ShareInputError("Only the group owner can move an expense to another group.");
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
  const now = new Date();
  await getDb().transaction(async (tx) => {
    if (existing) {
      const [updated] = await tx
        .update(sharedExpenses)
        .set({
          groupId: input.groupId ?? null,
          description: input.description,
          date: input.date,
          amount: input.amount,
          paidById: input.paidById,
          splitMode: input.splitMode,
          note: input.note,
          updatedAt: now,
        })
        .where(and(eq(sharedExpenses.id, id), eq(sharedExpenses.userId, existing.userId)))
        .returning();
      if (!updated) throw new NotFoundError("That shared expense is not in the book.");
      await tx.delete(sharedSplits).where(eq(sharedSplits.expenseId, id));
      if (scope.isOwner) await tx.delete(expenseTransactions).where(eq(expenseTransactions.expenseId, id));
    } else {
      await tx.insert(sharedExpenses).values({
        id,
        userId: scope.ownerId,
        groupId: input.groupId ?? null,
        description: input.description,
        date: input.date,
        amount: input.amount,
        currency: "NPR",
        paidById: input.paidById,
        splitMode: input.splitMode,
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

export async function createSharedExpense(userId: string, input: ExpenseInput) {
  return writeExpense(userId, crypto.randomUUID(), input, null);
}

export async function updateSharedExpense(userId: string, id: string, input: ExpenseInput) {
  const [existing] = await getDb()
    .select({ userId: sharedExpenses.userId, groupId: sharedExpenses.groupId })
    .from(sharedExpenses)
    .where(eq(sharedExpenses.id, id))
    .limit(1);
  if (!existing) throw new NotFoundError("That shared expense is not in the book.");
  return writeExpense(userId, id, input, existing);
}

export async function deleteSharedExpense(userId: string, id: string) {
  const [existing] = await getDb()
    .select({ userId: sharedExpenses.userId, groupId: sharedExpenses.groupId })
    .from(sharedExpenses)
    .where(eq(sharedExpenses.id, id))
    .limit(1);
  const scope = existing ? await rowScope(userId, existing) : null;
  if (!scope) throw new NotFoundError("That shared expense is not in the book.");
  await getDb().delete(sharedExpenses).where(and(eq(sharedExpenses.id, id), eq(sharedExpenses.userId, scope.ownerId)));
}

export async function createSettlement(userId: string, input: {
  fromPersonId: string;
  toPersonId: string;
  amount: number;
  date: string;
  groupId?: string | null;
  note: string;
  transactionId?: string | null;
}) {
  if (input.fromPersonId === input.toPersonId) throw new ShareInputError("A settlement needs two different people.");
  const scope = await groupScope(userId, input.groupId);
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
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
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
      .where(and(eq(settlements.transactionId, transactionId), eq(settlements.userId, userId)))
      .limit(1);
    if (other) throw new ShareInputError("That bank line is already linked to a settlement.");
  }
  const id = crypto.randomUUID();
  await getDb().insert(settlements).values({
    id,
    userId: scope.ownerId,
    groupId: input.groupId ?? null,
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

export async function deleteSettlement(userId: string, id: string) {
  const [existing] = await getDb()
    .select({ userId: settlements.userId, groupId: settlements.groupId })
    .from(settlements)
    .where(eq(settlements.id, id))
    .limit(1);
  const scope = existing ? await rowScope(userId, existing) : null;
  if (!scope) throw new NotFoundError("That settlement is not in the book.");
  await getDb().delete(settlements).where(and(eq(settlements.id, id), eq(settlements.userId, scope.ownerId)));
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
