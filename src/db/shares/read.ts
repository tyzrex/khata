import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { expenseTransactions, groupMembers, groupUserAccess, groups, people, settlements, sharedExpenseRevisions, sharedExpenses, sharedSplits, transactions, user } from "@/db/schema";
import { pairwiseDebts, netsFromDebts, simplifyNets, type ExpenseForBalance, type SettlementForBalance, type SplitMode } from "@/lib/split";
import { groupLabel, iso, loadUserNames, nameOf } from "@/db/shares/names";
import { rowScope } from "@/db/shares/permissions";
import { ensureSelf } from "@/db/shares/people";
import type { BalanceScope, DebtDto, ExpenseDto, ExpenseRevisionDto, GroupKind, JoinedGroup, PersonDto, ShareBook } from "@/db/shares/types";

/**
 * Reading a share book.
 *
 * A book has two halves that must never be confused: what the owner recorded,
 * and what a group the owner invited someone into recorded. `loadJoinedGroup`
 * exists so the second half can be read without the first: it scopes every query
 * to one group id, so a member can never widen a read into the owner's private
 * ledger by following a relationship.
 */

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

/** Descending by date, then id, so paging over a stable order is possible. */
function newestFirst<T extends { date: string; id: string }>(rows: T[]) {
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/**
 * Expense rows to the shape the UI and the agent API both read.
 *
 * Three callers need this and none of them can see the others' data: the owner's
 * own book, a group the owner let someone join, and a single expense fetched by
 * id. Names are resolved against the *owner's* roster in every case, which is
 * why the roster is passed in rather than looked up from the reader's account.
 */
function toExpenseDtos(
  rows: (typeof sharedExpenses.$inferSelect)[],
  ctx: {
    roster: PersonDto[];
    /** null when the expense is not in a group at all. */
    groupName: (groupId: string | null) => string | null;
    splits: (typeof sharedSplits.$inferSelect)[];
    revisions: (typeof sharedExpenseRevisions.$inferSelect)[];
    accountNames: Map<string, string>;
    /** Linked bank lines. Omitted where the caller is not the owner and cannot see them. */
    transactionIds?: (expenseId: string) => string[];
  },
): ExpenseDto[] {
  return rows.map((expense) => ({
    id: expense.id,
    groupId: expense.groupId,
    groupName: ctx.groupName(expense.groupId),
    description: expense.description,
    date: expense.date,
    amount: expense.amount,
    paidById: expense.paidById,
    paidByName: nameOf(ctx.roster, expense.paidById),
    splitMode: expense.splitMode as SplitMode,
    category: expense.category,
    note: expense.note,
    createdByName: expense.createdByUserId ? ctx.accountNames.get(expense.createdByUserId) ?? null : null,
    updatedByName: expense.updatedByUserId ? ctx.accountNames.get(expense.updatedByUserId) ?? null : null,
    version: expense.version,
    createdAt: iso(expense.createdAt),
    updatedAt: iso(expense.updatedAt),
    revisions: revisionsFor(expense.id, ctx.revisions),
    splits: ctx.splits
      .filter((split) => split.expenseId === expense.id)
      .map((split) => ({ personId: split.personId, name: nameOf(ctx.roster, split.personId), amount: split.amount, weight: split.weight })),
    transactionIds: ctx.transactionIds?.(expense.id) ?? [],
  }));
}

/**
 * One shared expense the caller is allowed to see, by id, together with which of
 * the owner's people rows is "you". Reading the whole book to find a single row
 * was the alternative, and it scales with the account rather than the request.
 */
/** The other member of a two-person book: the friend a direct group is with. */
async function otherMemberName(ownerId: string, ownerName: string): Promise<string | null> {
  const rows = await getDb()
    .select({ name: people.name, isSelf: people.isSelf })
    .from(people)
    .where(eq(people.userId, ownerId));
  const others = rows.filter((row) => !row.isSelf);
  return others.length === 1 ? others[0]!.name : ownerName;
}

export async function findSharedExpense(actorId: string, expenseId: string): Promise<{ expense: ExpenseDto; selfId: string } | null> {
  const db = getDb();
  const [expense] = await db.select().from(sharedExpenses).where(eq(sharedExpenses.id, expenseId)).limit(1);
  if (!expense) return null;
  const scope = await rowScope(actorId, expense);
  if (!scope) return null;

  const ownerPeople = await db.select().from(people).where(eq(people.userId, scope.ownerId));
  // An invited member is a row carrying `linkedUserId`. The owner has no such
  // link — they *are* the book, so their own row is the one flagged `isSelf`.
  const mine = ownerPeople.find((person) => person.linkedUserId === actorId) ?? (scope.isOwner ? ownerPeople.find((person) => person.isSelf) : undefined);
  if (!mine) return null;
  const roster: PersonDto[] = ownerPeople.map((person) => ({ id: person.id, name: person.name, isSelf: person.isSelf, linkedUserId: person.linkedUserId }));

  const group = expense.groupId ? (await groupLabel(scope.ownerId, expense.groupId)) : null;
  if (expense.groupId && !group) return null;
  // A friend's direct book is named for the friend in *that* book, matching how
  // the same group reads everywhere else — not for whoever else the owner has.
  const friendName = group ? await otherMemberName(scope.ownerId, group.title) : undefined;

  const [splits, revisions, links, accountNames] = await Promise.all([
    db.select().from(sharedSplits).where(eq(sharedSplits.expenseId, expense.id)),
    db.select().from(sharedExpenseRevisions).where(eq(sharedExpenseRevisions.expenseId, expense.id)),
    scope.isOwner ? db.select({ transactionId: expenseTransactions.transactionId }).from(expenseTransactions).where(eq(expenseTransactions.expenseId, expense.id)) : [],
    loadUserNames([expense.createdByUserId, expense.updatedByUserId]),
  ]);

  const [dto] = toExpenseDtos([expense], {
    roster,
    groupName: () => (group?.path.startsWith("/friends/") ? (friendName ?? group.title) : (group?.title ?? null)),
    splits,
    revisions,
    accountNames,
    // A member reading someone else's book is not shown the owner's bank lines.
    transactionIds: scope.isOwner ? () => links.map((link) => link.transactionId) : undefined,
  });
  return { expense: dto, selfId: mine.id };
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

export async function loadJoinedGroup(userId: string, groupId: string, ownerId: string): Promise<JoinedGroup | null> {
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
  const groupLabelFor = (groupId: string | null) => (groupId === group.id ? (kind === "direct" ? ownerName : group.name) : null);
  return {
    id: group.id,
    name: kind === "direct" ? ownerName : group.name,
    kind,
    ownerName,
    members,
    people: visible,
    self: { id: mine.id, name: "You", isSelf: true, linkedUserId: userId },
    balances: scopeFor(debts, mine.id, roster, [...involved]),
    expenses: newestFirst(
      toExpenseDtos(expenseRows, {
        roster,
        groupName: groupLabelFor,
        splits: splitRows,
        revisions: revisionRows,
        accountNames,
      }),
    ),
    settlements: newestFirst(
      settlementRows.map((settlement) => ({
        id: settlement.id,
        groupId: settlement.groupId,
        groupName: groupLabelFor(settlement.groupId),
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
      })),
    ),
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
  const expenses = newestFirst(
    toExpenseDtos(expenseRows, {
      roster,
      groupName: (id) => (id ? groupName.get(id) ?? null : null),
      splits: splitRows,
      revisions: revisionRows,
      accountNames,
      transactionIds: (id) => linkRows.filter((link) => link.expenseId === id).map((link) => link.transactionId),
    }),
  );

  const settlementDtos = newestFirst(
    settlementRows.map((settlement) => {
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
    }),
  );

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
