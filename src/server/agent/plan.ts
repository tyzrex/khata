import type { BalanceScope, ShareBook } from "@/db/shares";
import type { SharedCategory } from "@/lib/constants";
import { formatNpr } from "@/lib/format";
import { buildSplits, ShareInputError, type BuiltSplit, type SplitMode, type SplitParticipant } from "@/lib/split";
import { AgentInputError, isSelfWord, matchNamed, matchPerson, type Named } from "@/server/agent/match";

/**
 * Turns an agent's name-based request into the id-based input the share book
 * already validates and writes. Pure: it reads a ShareBook snapshot and returns a
 * plan; the route performs the writes.
 */

/** One book an entry can live in: your own (outside any group), a group you own, or one you joined. */
export type BookScope = {
  groupId: string | null;
  groupName: string | null;
  kind: "outside" | "group" | "direct";
  owned: boolean;
  /** Who owns the book; null for your own. */
  ownerName: string | null;
  selfId: string;
  /** Who may take part in an entry here. */
  members: Named[];
  balances: BalanceScope;
};

export function scopesOf(book: ShareBook) {
  const own: BookScope = {
    groupId: null,
    groupName: null,
    kind: "outside",
    owned: true,
    ownerName: null,
    selfId: book.self.id,
    members: book.people,
    balances: book.overall,
  };
  const groups: BookScope[] = [
    ...book.groups.map((group) => ({
      groupId: group.id,
      groupName: group.name,
      kind: group.kind,
      owned: true,
      ownerName: null,
      selfId: book.self.id,
      members: group.members,
      balances: group.balances,
    })),
    ...book.joinedGroups.map((group) => ({
      groupId: group.id,
      groupName: group.name,
      kind: group.kind,
      owned: false,
      ownerName: group.ownerName,
      selfId: group.self.id,
      members: group.members,
      balances: group.balances,
    })),
  ];
  return { own, groups };
}

function scopeLabel(scope: BookScope) {
  if (scope.kind === "outside") return "outside any group";
  if (scope.kind === "direct") return `your shared book with ${scope.groupName}`;
  return scope.owned ? `"${scope.groupName}"` : `"${scope.groupName}" (owned by ${scope.ownerName})`;
}

/** A named group by id or name. Direct friend books only match by id. */
export function findGroup(book: ShareBook, query: string) {
  const { groups } = scopesOf(book);
  const byId = groups.find((scope) => scope.groupId === query.trim());
  if (byId) return byId;
  const named = groups.filter((scope) => scope.kind === "group");
  const hit = matchNamed(
    query,
    named.map((scope) => ({ id: scope.groupId!, name: scope.groupName! })),
    "group",
  );
  return named.find((scope) => scope.groupId === hit.id)!;
}

type Resolved = { scope: BookScope; ids: string[] };

/** Resolve every name in one scope, or throw the first naming mistake. */
function resolveIn(scope: BookScope, names: string[], accountName?: string) {
  const where = scope.kind === "outside" ? "" : ` in ${scopeLabel(scope)}`;
  return names.map((name) => matchPerson(name, scope.members, scope.selfId, { accountName, where }).id);
}

/** One member of a scope by name, "me", or id. */
export function matchPersonIn(scope: BookScope, name: string, accountName?: string) {
  return resolveIn(scope, [name], accountName)[0]!;
}

/**
 * Pick the book for a set of names when no group was named. Your own book wins
 * when everyone is in it. Otherwise the names have to fit exactly one book you
 * joined, such as the one a friend invited you to.
 */
function pickScope(book: ShareBook, names: string[], accountName?: string): Resolved {
  const { own, groups } = scopesOf(book);
  try {
    return { scope: own, ids: resolveIn(own, names, accountName) };
  } catch (ownError) {
    const fits = groups
      .filter((scope) => !scope.owned)
      .flatMap((scope) => {
        try {
          return [{ scope, ids: resolveIn(scope, names, accountName) }];
        } catch {
          return [];
        }
      });
    if (fits.length === 1) return fits[0]!;
    if (fits.length > 1) {
      const labels = fits.map((fit) => fit.scope.groupName ?? "");
      throw new AgentInputError(`Those people are in more than one shared book: ${labels.map((label) => `"${label}"`).join(", ")}. Name the group.`, labels);
    }
    throw ownError;
  }
}

export type SplitEntry = { person: string; value?: number };

export type ExpenseRequest = {
  description: string;
  amount: number;
  date: string;
  note: string;
  group?: string | null;
  paidBy?: string | null;
  splitWith?: string[];
  excludeMe?: boolean;
  splitMode?: SplitMode;
  split?: SplitEntry[];
  /** One of `SHARED_CATEGORIES`, or null when the agent did not pick one. */
  category?: SharedCategory | null;
};

export type ExpensePlan = {
  scope: BookScope;
  /** Set when the expense belongs in the two-person book with this friend (created on demand). */
  directWith: string | null;
  write: {
    description: string;
    date: string;
    amount: number;
    paidById: string;
    groupId: string | null;
    splitMode: SplitMode;
    category: string | null;
    note: string;
    participants: SplitParticipant[];
    transactionIds: string[];
  };
  splits: BuiltSplit[];
};

function unique(ids: string[]) {
  return [...new Set(ids)];
}

function participantsFor(mode: SplitMode, entries: { id: string; value?: number }[]): SplitParticipant[] {
  return entries.map((entry) => {
    if (mode === "equal") return { personId: entry.id };
    if (entry.value === undefined) throw new AgentInputError(`A ${mode} split needs a value for every person in "split".`);
    return mode === "exact" ? { personId: entry.id, amount: entry.value } : { personId: entry.id, weight: entry.value };
  });
}

/**
 * The share book requires the payer to be in the split. When the payer covered
 * others without taking a share, work out the others' amounts and give the payer
 * an exact zero instead.
 */
function withPayer(mode: SplitMode, total: number, paidById: string, participants: SplitParticipant[]) {
  if (participants.some((participant) => participant.personId === paidById)) return { mode, participants };
  const shares = buildSplits({ mode, total, paidById: participants[0]!.personId, participants });
  return {
    mode: "exact" as const,
    participants: [...shares.map((share) => ({ personId: share.personId, amount: share.amount })), { personId: paidById, amount: 0 }],
  };
}

export function planExpense(book: ShareBook, request: ExpenseRequest, opts: { accountName?: string } = {}): ExpensePlan {
  const payerName = request.paidBy?.trim() || "me";
  const split = request.split?.filter((entry) => entry.person.trim()) ?? [];
  const splitWith = request.splitWith?.filter((name) => name.trim()) ?? [];
  const mode: SplitMode = request.splitMode ?? (split.length && split.some((entry) => entry.value !== undefined) ? "exact" : "equal");
  if (mode !== "equal" && !split.length) {
    throw new AgentInputError(`A ${mode} split needs "split": [{ "person": "...", "value": ... }] with one entry per person.`);
  }

  const named = [payerName, ...splitWith, ...split.map((entry) => entry.person)];
  let resolved: Resolved;
  if (request.group?.trim()) {
    const scope = findGroup(book, request.group);
    resolved = { scope, ids: resolveIn(scope, named, opts.accountName) };
  } else {
    if (!splitWith.length && !split.length) {
      throw new AgentInputError('Say who shares this expense with "splitWith" (names), or name a "group" to split with all its members.');
    }
    resolved = pickScope(book, named, opts.accountName);
  }
  const { scope } = resolved;
  const [paidById, ...rest] = resolved.ids;
  const withIds = rest.slice(0, splitWith.length);
  const splitIds = rest.slice(splitWith.length);

  let participants: SplitParticipant[];
  if (split.length) {
    if (unique(splitIds).length !== splitIds.length) throw new AgentInputError("Each person can appear only once in \"split\".");
    participants = participantsFor(mode, split.map((entry, index) => ({ id: splitIds[index]!, value: entry.value })));
  } else {
    const base = withIds.length ? withIds : scope.members.map((member) => member.id);
    const payerShares = !(request.excludeMe && paidById === scope.selfId);
    let sharers = unique([...base, ...(payerShares ? [paidById!] : []), ...(request.excludeMe ? [] : [scope.selfId])]);
    if (request.excludeMe) sharers = sharers.filter((id) => id !== scope.selfId);
    if (!sharers.length) throw new AgentInputError("Nobody is left to share this expense. Add people to splitWith or drop excludeMe.");
    participants = participantsFor("equal", sharers.map((id) => ({ id })));
  }

  const fitted = withPayer(mode, request.amount, paidById!, participants);
  let splits: BuiltSplit[];
  try {
    splits = buildSplits({ mode: fitted.mode, total: request.amount, paidById: paidById!, participants: fitted.participants });
  } catch (error) {
    if (error instanceof ShareInputError) throw new AgentInputError(error.message);
    throw error;
  }

  const others = unique(splits.map((share) => share.personId).concat(paidById!)).filter((id) => id !== scope.selfId);
  const directWith = scope.kind === "outside" && others.length === 1 ? others[0]! : null;
  return {
    scope,
    directWith,
    write: {
      description: request.description,
      date: request.date,
      amount: request.amount,
      paidById: paidById!,
      groupId: scope.groupId,
      splitMode: fitted.mode,
      category: request.category ?? null,
      note: request.note,
      participants: fitted.participants,
      transactionIds: [],
    },
    splits,
  };
}

export type SettlementRequest = { from?: string | null; to?: string | null; amount: number; date: string; note: string; group?: string | null };

export type SettlementPlan = {
  scope: BookScope;
  /** Set when the payment belongs in the two-person book with this friend. */
  directWith: string | null;
  write: { fromPersonId: string; toPersonId: string; amount: number; date: string; groupId: string | null; note: string; transactionId: null };
};

function owes(scope: BalanceScope, fromId: string, toId: string) {
  return [...scope.youOwe, ...scope.youAreOwed, ...scope.others].some((debt) => debt.fromId === fromId && debt.toId === toId);
}

export function planSettlement(book: ShareBook, request: SettlementRequest, opts: { accountName?: string } = {}): SettlementPlan {
  const from = request.from?.trim() || "me";
  const to = request.to?.trim() || "me";
  if (isSelfWord(from) && isSelfWord(to)) throw new AgentInputError('Say who paid ("from") and who was paid ("to"). One of them can be "me".');
  const resolved = request.group?.trim()
    ? (() => {
        const scope = findGroup(book, request.group!);
        return { scope, ids: resolveIn(scope, [from, to], opts.accountName) };
      })()
    : pickScope(book, [from, to], opts.accountName);
  const [fromId, toId] = resolved.ids as [string, string];
  if (fromId === toId) throw new AgentInputError("A payment needs two different people.");

  let scope = resolved.scope;
  let directWith: string | null = null;
  if (scope.kind === "outside") {
    // Record it where the debt is, so the group's balance clears too.
    const { groups } = scopesOf(book);
    const owned = groups.filter((group) => group.owned);
    const hits = owned.filter((group) => owes(group.balances, fromId, toId));
    if (hits.length === 1) scope = hits[0]!;
    else if (hits.length > 1) {
      const labels = hits.map((hit) => (hit.kind === "direct" ? hit.groupId! : hit.groupName!));
      throw new AgentInputError(
        `That balance is open in more than one book: ${hits.map((hit) => (hit.kind === "direct" ? `the direct book (group id ${hit.groupId})` : `"${hit.groupName}"`)).join(", ")}. Pass "group" with the name or id.`,
        labels,
      );
    } else {
      const friend = [fromId, toId].find((id) => id !== book.self.id);
      if ([fromId, toId].includes(book.self.id) && friend) directWith = friend;
    }
  }
  return {
    scope,
    directWith,
    write: { fromPersonId: fromId, toPersonId: toId, amount: request.amount, date: request.date, groupId: scope.groupId, note: request.note, transactionId: null },
  };
}

/** Mid-sentence: "Split equally: you NPR 60." Lowercase reads correctly there. */
function nameIn(scope: BookScope, id: string) {
  if (id === scope.selfId) return "you";
  return scope.members.find((member) => member.id === id)?.name ?? "someone";
}

/**
 * As a value in a response body, where it sits next to `"You"` in every other
 * endpoint's data — an expense reports `paidBy: "You"`, so a settlement has to
 * report `to: "You"` too, not the prose form.
 */
function displayNameIn(scope: BookScope, id: string) {
  if (id === scope.selfId) return "You";
  return scope.members.find((member) => member.id === id)?.name ?? "Someone";
}

/** "Split equally: you NPR 400, Sameer NPR 400." */
export function describeSplits(scope: BookScope, mode: SplitMode, splits: BuiltSplit[]) {
  const how = mode === "equal" ? "Split equally" : mode === "exact" ? "Split by amount" : mode === "percent" ? "Split by percent" : "Split by shares";
  return `${how}: ${splits.map((share) => `${nameIn(scope, share.personId)} ${formatNpr(share.amount)}`).join(", ")}.`;
}

export function whereText(scope: BookScope) {
  return scopeLabel(scope);
}

export function personName(scope: BookScope, id: string) {
  return displayNameIn(scope, id);
}

/** Positive: they owe you. Negative: you owe them. */
export function netWith(scope: BalanceScope, friendId: string) {
  const owed = scope.youAreOwed.filter((debt) => debt.fromId === friendId).reduce((total, debt) => total + debt.amount, 0);
  const owe = scope.youOwe.filter((debt) => debt.toId === friendId).reduce((total, debt) => total + debt.amount, 0);
  return Math.round((owed - owe) * 100) / 100;
}

export function netOf(scope: BalanceScope) {
  const owed = scope.youAreOwed.reduce((total, debt) => total + debt.amount, 0);
  const owe = scope.youOwe.reduce((total, debt) => total + debt.amount, 0);
  return Math.round((owed - owe) * 100) / 100;
}

/** "Sameer owes you NPR 1,425" / "You owe Anita NPR 2,000" / "You and Rajan are settled up". */
export function netSentence(name: string, net: number) {
  if (Math.abs(net) < 0.005) return `You and ${name} are settled up`;
  return net > 0 ? `${name} owes you ${formatNpr(net)}` : `You owe ${name} ${formatNpr(-net)}`;
}

export type FriendBalance = { id: string; name: string; onKhata: boolean; net: number; book: string | null; summary: string };

/** Every friend with your net balance: friends in your book, then people who own a book you joined. */
export function friendBalances(book: ShareBook): FriendBalance[] {
  const own = book.people
    .filter((person) => !person.isSelf)
    .map((person) => {
      const net = netWith(book.overall, person.id);
      return { id: person.id, name: person.name, onKhata: person.linkedUserId != null, net, book: null, summary: netSentence(person.name, net) };
    });
  const joined = book.joinedGroups
    .filter((group) => group.kind === "direct")
    .map((group) => {
      const net = netOf(group.balances);
      const owner = group.members.find((member) => member.id !== group.self.id);
      return { id: owner?.id ?? group.id, name: group.ownerName, onKhata: true, net, book: group.id, summary: netSentence(group.ownerName, net) };
    });
  return [...own, ...joined];
}

/** Plain sentences a bot can read out, one per open balance. */
export function balanceLines(book: ShareBook) {
  const lines = [
    ...book.overall.youAreOwed.map((debt) => `${debt.fromName} owes you ${formatNpr(debt.amount)}`),
    ...book.overall.youOwe.map((debt) => `You owe ${debt.toName} ${formatNpr(debt.amount)}`),
  ];
  for (const group of book.joinedGroups) {
    const where = group.kind === "direct" ? "" : ` in "${group.name}"`;
    lines.push(...group.balances.youAreOwed.map((debt) => `${debt.fromName} owes you ${formatNpr(debt.amount)}${where}`));
    lines.push(...group.balances.youOwe.map((debt) => `You owe ${debt.toName} ${formatNpr(debt.amount)}${where}`));
  }
  return lines;
}
