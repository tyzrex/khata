import { inArray, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  expenseTransactions,
  groupMembers,
  groups,
  people,
  settlements,
  sharedExpenses,
  sharedSplits,
  transactions,
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

type PersonDto = { id: string; name: string; isSelf: boolean };

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

export type ShareBook = {
  self: PersonDto;
  people: PersonDto[];
  groups: {
    id: string;
    name: string;
    members: PersonDto[];
    balances: BalanceScope;
  }[];
  overall: BalanceScope;
  expenses: {
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
  }[];
  settlements: {
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
  }[];
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

export async function ensureSelf() {
  const db = getDb();
  const existing = await db.select().from(people).where(eq(people.isSelf, true)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(people)
    .values({ id: "person-self", name: "You", isSelf: true })
    .onConflictDoUpdate({ target: people.id, set: { isSelf: true, updatedAt: new Date() } })
    .returning();
  return created;
}

async function requirePeople(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = await getDb().select({ id: people.id }).from(people).where(inArray(people.id, unique));
  if (rows.length !== unique.length) throw new ShareInputError("One of those people is not in the book.");
}

async function requireGroup(groupId: string | null | undefined) {
  if (!groupId) return null;
  const [group] = await getDb().select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) throw new ShareInputError("That group is not in the book.");
  return group;
}

export async function getShareBook(): Promise<ShareBook> {
  const selfRow = await ensureSelf();
  const db = getDb();
  const personRows = await db.select().from(people);
  const roster: PersonDto[] = personRows
    .map((person) => ({ id: person.id, name: person.name, isSelf: person.isSelf }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name));
  const groupRows = await db.select().from(groups);
  const memberRows = await db.select().from(groupMembers);
  const expenseRows = await db.select().from(sharedExpenses);
  const splitRows = await db.select().from(sharedSplits);
  const linkRows = await db.select().from(expenseTransactions);
  const settlementRows = await db.select().from(settlements);
  const linkedIds = [
    ...new Set([
      ...linkRows.map((link) => link.transactionId),
      ...settlementRows.map((settlement) => settlement.transactionId).filter((id): id is string => Boolean(id)),
    ]),
  ];
  const bankRows = linkedIds.length ? await db.select().from(transactions).where(inArray(transactions.id, linkedIds)) : [];
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

  const self = { id: selfRow.id, name: selfRow.name, isSelf: true };
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

  return {
    self,
    people: roster,
    groups: groupDtos,
    overall: scopeFor(overallDebts, self.id, roster, roster.map((person) => person.id)),
    expenses,
    settlements: settlementDtos,
    links,
  };
}

export async function createPerson(name: string) {
  const [row] = await getDb()
    .insert(people)
    .values({ id: crypto.randomUUID(), name, isSelf: false })
    .returning();
  return { id: row.id, name: row.name, isSelf: row.isSelf };
}

export async function renamePerson(id: string, name: string) {
  const [row] = await getDb().update(people).set({ name, updatedAt: new Date() }).where(eq(people.id, id)).returning();
  if (!row) throw new NotFoundError("That person is not in the book.");
  return { id: row.id, name: row.name, isSelf: row.isSelf };
}

export async function deletePerson(id: string) {
  const [row] = await getDb().select().from(people).where(eq(people.id, id)).limit(1);
  if (!row) throw new NotFoundError("That person is not in the book.");
  if (row.isSelf) throw new ShareInputError("You stay in the book. Rename yourself instead.");
  try {
    await getDb().delete(people).where(eq(people.id, id));
  } catch (error) {
    if (pgCode(error) === "23503") {
      throw new ShareInputError("This person still has a shared expense or a settlement. Clear those first.");
    }
    throw error;
  }
}

export async function createGroup(name: string, memberIds: string[]) {
  const unique = [...new Set(memberIds)];
  await requirePeople(unique);
  const id = crypto.randomUUID();
  await getDb().transaction(async (tx) => {
    await tx.insert(groups).values({ id, name });
    await tx.insert(groupMembers).values(unique.map((personId) => ({ groupId: id, personId })));
  });
  return id;
}

export async function updateGroup(id: string, input: { name?: string; memberIds?: string[] }) {
  const [group] = await getDb().select().from(groups).where(eq(groups.id, id)).limit(1);
  if (!group) throw new NotFoundError("That group is not in the book.");
  const unique = input.memberIds ? [...new Set(input.memberIds)] : undefined;
  if (unique) await requirePeople(unique);
  await getDb().transaction(async (tx) => {
    if (input.name) await tx.update(groups).set({ name: input.name, updatedAt: new Date() }).where(eq(groups.id, id));
    if (unique) {
      await tx.delete(groupMembers).where(eq(groupMembers.groupId, id));
      await tx.insert(groupMembers).values(unique.map((personId) => ({ groupId: id, personId })));
    }
  });
}

export async function deleteGroup(id: string) {
  const [group] = await getDb().delete(groups).where(eq(groups.id, id)).returning();
  if (!group) throw new NotFoundError("That group is not in the book.");
}

async function assertExpenseLinks(transactionIds: string[], exceptExpenseId?: string) {
  const unique = [...new Set(transactionIds)];
  if (unique.length === 0) return unique;
  const rows = await getDb().select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, unique));
  if (rows.length !== unique.length) throw new ShareInputError("One of those bank lines is not in the ledger.");
  const usedBySettlement = await getDb().select({ id: settlements.id }).from(settlements).where(inArray(settlements.transactionId, unique));
  if (usedBySettlement.length) throw new ShareInputError("That bank line is already linked to a settlement.");
  const usedByExpense = await getDb().select().from(expenseTransactions).where(inArray(expenseTransactions.transactionId, unique));
  if (usedByExpense.some((link) => link.expenseId !== exceptExpenseId)) {
    throw new ShareInputError("That bank line is already linked to a shared expense.");
  }
  return unique;
}

async function writeExpense(
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
  existing: boolean,
) {
  await requirePeople([input.paidById, ...input.participants.map((participant) => participant.personId)]);
  await requireGroup(input.groupId);
  const splits = buildSplits({
    mode: input.splitMode,
    total: input.amount,
    paidById: input.paidById,
    participants: input.participants,
  });
  const links = await assertExpenseLinks(input.transactionIds, existing ? id : undefined);
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
        .where(eq(sharedExpenses.id, id))
        .returning();
      if (!updated) throw new NotFoundError("That shared expense is not in the book.");
      await tx.delete(sharedSplits).where(eq(sharedSplits.expenseId, id));
      await tx.delete(expenseTransactions).where(eq(expenseTransactions.expenseId, id));
    } else {
      await tx.insert(sharedExpenses).values({
        id,
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

export async function createSharedExpense(input: Parameters<typeof writeExpense>[1]) {
  return writeExpense(crypto.randomUUID(), input, false);
}

export async function updateSharedExpense(id: string, input: Parameters<typeof writeExpense>[1]) {
  const [existing] = await getDb().select({ id: sharedExpenses.id }).from(sharedExpenses).where(eq(sharedExpenses.id, id)).limit(1);
  if (!existing) throw new NotFoundError("That shared expense is not in the book.");
  return writeExpense(id, input, true);
}

export async function deleteSharedExpense(id: string) {
  const [row] = await getDb().delete(sharedExpenses).where(eq(sharedExpenses.id, id)).returning();
  if (!row) throw new NotFoundError("That shared expense is not in the book.");
}

export async function createSettlement(input: {
  fromPersonId: string;
  toPersonId: string;
  amount: number;
  date: string;
  groupId?: string | null;
  note: string;
  transactionId?: string | null;
}) {
  if (input.fromPersonId === input.toPersonId) throw new ShareInputError("A settlement needs two different people.");
  await requirePeople([input.fromPersonId, input.toPersonId]);
  await requireGroup(input.groupId);
  const transactionId = input.transactionId ?? null;
  if (transactionId) {
    const [bank] = await getDb().select({ id: transactions.id }).from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!bank) throw new ShareInputError("That bank line is not in the ledger.");
    const [expenseLink] = await getDb()
      .select({ expenseId: expenseTransactions.expenseId })
      .from(expenseTransactions)
      .where(eq(expenseTransactions.transactionId, transactionId))
      .limit(1);
    if (expenseLink) throw new ShareInputError("That bank line is already linked to a shared expense.");
    const [other] = await getDb().select({ id: settlements.id }).from(settlements).where(eq(settlements.transactionId, transactionId)).limit(1);
    if (other) throw new ShareInputError("That bank line is already linked to a settlement.");
  }
  const id = crypto.randomUUID();
  await getDb().insert(settlements).values({
    id,
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

export async function deleteSettlement(id: string) {
  const [row] = await getDb().delete(settlements).where(eq(settlements.id, id)).returning();
  if (!row) throw new NotFoundError("That settlement is not in the book.");
}

export async function seedSampleBook() {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const person of samplePeople) {
      await tx
        .insert(people)
        .values({ id: person.id, name: person.name, isSelf: person.isSelf })
        .onConflictDoUpdate({
          target: people.id,
          set: { name: person.name, isSelf: person.isSelf, updatedAt: new Date() },
        });
    }
    await tx
      .insert(groups)
      .values({ id: sampleGroup.id, name: sampleGroup.name })
      .onConflictDoUpdate({ target: groups.id, set: { name: sampleGroup.name, updatedAt: new Date() } });
    await tx.delete(groupMembers).where(eq(groupMembers.groupId, sampleGroup.id));
    await tx.insert(groupMembers).values(sampleGroup.memberIds.map((personId) => ({ groupId: sampleGroup.id, personId })));

    const externalIds = [
      ...new Set([
        ...sampleExpenses.flatMap((expense) => expense.transactionExternalIds),
        ...sampleSettlements.map((settlement) => settlement.transactionExternalId).filter((id): id is string => Boolean(id)),
      ]),
    ];
    const bankRows = externalIds.length
      ? await tx.select({ id: transactions.id, externalId: transactions.externalId }).from(transactions).where(inArray(transactions.externalId, externalIds))
      : [];
    const bankId = new Map(bankRows.map((row) => [row.externalId, row.id]));

    for (const expense of sampleExpenses) {
      const splits = buildSplits({
        mode: expense.splitMode,
        total: expense.amount,
        paidById: expense.paidById,
        participants: expense.participants,
      });
      await tx
        .insert(sharedExpenses)
        .values({
          id: expense.id,
          groupId: expense.groupId,
          description: expense.description,
          date: expense.date,
          amount: expense.amount,
          currency: "NPR",
          paidById: expense.paidById,
          splitMode: expense.splitMode,
          note: expense.note,
        })
        .onConflictDoUpdate({
          target: sharedExpenses.id,
          set: {
            groupId: expense.groupId,
            description: expense.description,
            date: expense.date,
            amount: expense.amount,
            paidById: expense.paidById,
            splitMode: expense.splitMode,
            note: expense.note,
            updatedAt: new Date(),
          },
        });
      await tx.delete(sharedSplits).where(eq(sharedSplits.expenseId, expense.id));
      await tx.insert(sharedSplits).values(
        splits.map((split) => ({
          expenseId: expense.id,
          personId: split.personId,
          amount: split.amount,
          weight: split.weight,
        })),
      );
      await tx.delete(expenseTransactions).where(eq(expenseTransactions.expenseId, expense.id));
      const links = expense.transactionExternalIds.map((externalId) => bankId.get(externalId)).filter((id): id is string => Boolean(id));
      if (links.length) {
        await tx.insert(expenseTransactions).values(links.map((transactionId) => ({ expenseId: expense.id, transactionId })));
      }
    }

    for (const settlement of sampleSettlements) {
      const transactionId = settlement.transactionExternalId ? bankId.get(settlement.transactionExternalId) ?? null : null;
      await tx
        .insert(settlements)
        .values({
          id: settlement.id,
          groupId: settlement.groupId,
          fromPersonId: settlement.fromPersonId,
          toPersonId: settlement.toPersonId,
          amount: settlement.amount,
          currency: "NPR",
          date: settlement.date,
          note: settlement.note,
          transactionId,
        })
        .onConflictDoUpdate({
          target: settlements.id,
          set: {
            groupId: settlement.groupId,
            fromPersonId: settlement.fromPersonId,
            toPersonId: settlement.toPersonId,
            amount: settlement.amount,
            date: settlement.date,
            note: settlement.note,
            transactionId,
            updatedAt: new Date(),
          },
        });
    }
  });
}
