/**
 * The share book repository.
 *
 * Split by concern rather than by table: `permissions` decides who may act,
 * `read` and `expenses`/`settlements`/`groups`/`people` do the work, and
 * `activity` renders a committed write into something a person can read. The
 * barrel below is explicit rather than `export *` so a duplicate name across two
 * modules is a compile error instead of a silently dropped export.
 */

export type {
  BalanceScope,
  DebtDto,
  ExpenseDto,
  ExpenseRevisionDto,
  ExpenseRevisionSnapshot,
  GroupKind,
  JoinedGroup,
  PersonDto,
  Scope,
  SettlementDto,
  SettlementInput,
  SharedExpenseInput,
  SharedWriteActivity,
  ShareBook,
} from "@/db/shares/types";

export { groupLabel, type GroupLabel } from "@/db/shares/names";

// read
export { findSharedExpense, getShareBook } from "@/db/shares/read";
export { ensureSelf } from "@/db/shares/people";

// writes
export { createPerson, deletePerson, renamePerson } from "@/db/shares/people";
export { createGroup, deleteGroup, ensureDirectGroup, leaveGroup, updateGroup } from "@/db/shares/groups";
export { createSharedExpense, deleteSharedExpense, updateSharedExpense } from "@/db/shares/expenses";
export { createSettlement, deleteSettlement, updateSettlement } from "@/db/shares/settlements";
export { describeSharedWrite } from "@/db/shares/activity";
export { seedSampleBook } from "@/db/shares/seed";