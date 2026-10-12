import type { SplitMode } from "@/lib/split";

/**
 * The shapes a share book is read as.
 *
 * These are the contract between the repositories and everything above them: the
 * browser app renders them, and the agent API reshapes them into sentences. One
 * definition each, so the two readers cannot describe the same row differently.
 */

/** Someone in a book. `isSelf` is the owner's row, or the member's row of themselves in someone else's. */
export type PersonDto = { id: string; name: string; isSelf: boolean; linkedUserId: string | null };

export type DebtDto = {
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

/** Who a row belongs to, and whether the actor is that owner. */
export type Scope = { ownerId: string; isOwner: boolean };


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

export type SharedExpenseInput = {
  description: string;
  date: string;
  amount: number;
  paidById: string;
  groupId?: string | null;
  splitMode: SplitMode;
  /** One of SHARED_CATEGORIES, or null when unset. A shared entry never takes a personal category. */
  category?: string | null;
  note: string;
  participants: { personId: string; amount?: number; weight?: number }[];
  /** Bank lines this expense is linked to. Only the ledger's owner may set them. */
  transactionIds: string[];
  /** The version the editor opened. Required to update, absent to create. */
  version?: number;
};

export type SettlementInput = {
  fromPersonId: string;
  toPersonId: string;
  amount: number;
  date: string;
  groupId?: string | null;
  note: string;
  transactionId?: string | null;
  version?: number;
};
