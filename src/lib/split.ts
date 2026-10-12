import { toPaisa } from "@/lib/money";

export const SPLIT_MODES = ["equal", "exact", "shares", "percent"] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export class ShareInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareInputError";
  }
}

const PAISA = 100;

export { toPaisa };

export function fromPaisa(paisa: number) {
  return paisa / PAISA;
}

export type SplitParticipant = {
  personId: string;
  amount?: number;
  weight?: number;
};

export type BuiltSplit = {
  personId: string;
  amount: number;
  weight: number | null;
};

function uniquePeople(participants: SplitParticipant[]) {
  const seen = new Set<string>();
  for (const participant of participants) {
    if (seen.has(participant.personId)) {
      throw new ShareInputError("Each person can appear only once in a split.");
    }
    seen.add(participant.personId);
  }
}

function allocateByWeights(totalPaisa: number, weights: number[]) {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (!(sum > 0)) throw new ShareInputError("Split weights must be greater than zero.");
  const raw = weights.map((weight) => (totalPaisa * weight) / sum);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = totalPaisa - floors.reduce((total, value) => total + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const shares = [...floors];
  for (const next of order) {
    if (remainder <= 0) break;
    shares[next.index] += 1;
    remainder -= 1;
  }
  return shares;
}

export function buildSplits(input: {
  mode: SplitMode;
  total: number;
  paidById: string;
  participants: SplitParticipant[];
}): BuiltSplit[] {
  if (!SPLIT_MODES.includes(input.mode)) throw new ShareInputError("Choose equal, exact, shares, or percent.");
  const totalPaisa = toPaisa(input.total);
  if (totalPaisa <= 0) throw new ShareInputError("Amount must be greater than zero.");
  if (input.participants.length === 0) throw new ShareInputError("Add at least one person to the split.");
  uniquePeople(input.participants);
  if (!input.participants.some((participant) => participant.personId === input.paidById)) {
    throw new ShareInputError("The person who paid has to be part of the split.");
  }

  if (input.mode === "equal") {
    const base = Math.floor(totalPaisa / input.participants.length);
    let remainder = totalPaisa - base * input.participants.length;
    return input.participants.map((participant) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      return { personId: participant.personId, amount: fromPaisa(base + extra), weight: null };
    });
  }

  if (input.mode === "exact") {
    const amounts = input.participants.map((participant) => {
      const paisa = toPaisa(participant.amount ?? NaN);
      if (!Number.isFinite(paisa) || paisa < 0) throw new ShareInputError("Every exact share needs an amount of zero or more.");
      return paisa;
    });
    const sum = amounts.reduce((total, amount) => total + amount, 0);
    if (sum !== totalPaisa) {
      throw new ShareInputError("Exact shares have to add up to the total.");
    }
    return input.participants.map((participant, index) => ({
      personId: participant.personId,
      amount: fromPaisa(amounts[index]!),
      weight: null,
    }));
  }

  const weights = input.participants.map((participant) => participant.weight ?? NaN);
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw new ShareInputError(input.mode === "percent" ? "Every percent must be greater than zero." : "Every share count must be greater than zero.");
  }
  if (input.mode === "percent") {
    const percent = Math.round(weights.reduce((total, weight) => total + weight, 0) * 100);
    if (percent !== 10000) throw new ShareInputError("Percents have to add up to 100.");
  }
  const shares = allocateByWeights(totalPaisa, weights);
  return input.participants.map((participant, index) => ({
    personId: participant.personId,
    amount: fromPaisa(shares[index]!),
    weight: weights[index]!,
  }));
}

export type PairDebt = {
  fromId: string;
  toId: string;
  amount: number;
};

export type ExpenseForBalance = {
  groupId: string | null;
  paidById: string;
  splits: { personId: string; amount: number }[];
};

export type SettlementForBalance = {
  groupId: string | null;
  fromPersonId: string;
  toPersonId: string;
  amount: number;
};

function pairKey(debtor: string, creditor: string) {
  return `${debtor}\0${creditor}`;
}

function addDebt(matrix: Map<string, number>, debtor: string, creditor: string, paisa: number) {
  if (debtor === creditor || paisa === 0) return;
  let remaining = paisa;
  const reverseKey = pairKey(creditor, debtor);
  const reverse = matrix.get(reverseKey) ?? 0;
  if (reverse > 0) {
    if (reverse >= remaining) {
      const left = reverse - remaining;
      if (left === 0) matrix.delete(reverseKey);
      else matrix.set(reverseKey, left);
      return;
    }
    matrix.delete(reverseKey);
    remaining -= reverse;
  }
  const forwardKey = pairKey(debtor, creditor);
  matrix.set(forwardKey, (matrix.get(forwardKey) ?? 0) + remaining);
}

export function pairwiseDebts(
  expenses: ExpenseForBalance[],
  settlements: SettlementForBalance[],
  groupId?: string,
): PairDebt[] {
  const matrix = new Map<string, number>();
  const inScope = (value: string | null) => (groupId === undefined ? true : value === groupId);

  for (const expense of expenses) {
    if (!inScope(expense.groupId)) continue;
    for (const split of expense.splits) {
      addDebt(matrix, split.personId, expense.paidById, toPaisa(split.amount));
    }
  }
  for (const settlement of settlements) {
    if (!inScope(settlement.groupId)) continue;
    addDebt(matrix, settlement.toPersonId, settlement.fromPersonId, toPaisa(settlement.amount));
  }

  return [...matrix.entries()]
    .map(([key, paisa]) => {
      const [fromId, toId] = key.split("\0");
      return { fromId: fromId!, toId: toId!, amount: fromPaisa(paisa) };
    })
    .filter((debt) => debt.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.fromId.localeCompare(b.fromId));
}

export function simplifyNets(nets: { id: string; amount: number }[]): PairDebt[] {
  const creditors = nets
    .map((net) => ({ id: net.id, paisa: toPaisa(net.amount) }))
    .filter((net) => net.paisa > 0)
    .sort((a, b) => b.paisa - a.paisa);
  const debtors = nets
    .map((net) => ({ id: net.id, paisa: -toPaisa(net.amount) }))
    .filter((net) => net.paisa > 0)
    .sort((a, b) => b.paisa - a.paisa);
  const result: PairDebt[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]!;
    const creditor = creditors[creditorIndex]!;
    const paisa = Math.min(debtor.paisa, creditor.paisa);
    if (paisa > 0) result.push({ fromId: debtor.id, toId: creditor.id, amount: fromPaisa(paisa) });
    debtor.paisa -= paisa;
    creditor.paisa -= paisa;
    if (debtor.paisa === 0) debtorIndex += 1;
    if (creditor.paisa === 0) creditorIndex += 1;
  }
  return result;
}

export function netsFromDebts(personIds: string[], debts: PairDebt[]) {
  const nets = new Map(personIds.map((id) => [id, 0]));
  for (const debt of debts) {
    nets.set(debt.fromId, (nets.get(debt.fromId) ?? 0) - toPaisa(debt.amount));
    nets.set(debt.toId, (nets.get(debt.toId) ?? 0) + toPaisa(debt.amount));
  }
  return [...nets.entries()].map(([id, paisa]) => ({ id, amount: fromPaisa(paisa) }));
}
