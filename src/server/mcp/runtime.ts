import type { AgentIdentity } from "@/lib/agent-permissions";
import { createHash } from "node:crypto";
import { categorySchema } from "@/lib/schemas";
import { todayInKathmandu } from "@/lib/period";
import { deleteGroup, leaveGroup, renamePerson, deletePerson } from "@/db/shares";
import { listAccounts, createAccount, renameAccount, deleteAccount } from "@/db/accounts";
import { listCategories, createCategory, updateCategory, deleteCategory } from "@/db/categories";
import { beginAgentOperation, finishAgentOperation, listAgentOperations } from "@/db/agent-operations";
import { contextView } from "@/server/services/agent/context";
import { balancesView } from "@/server/services/agent/balances";
import { listEntries, readEntry, saveEntries, editEntry, deleteEntry } from "@/server/services/agent/transactions";
import { listFriends, addFriends } from "@/server/services/agent/friends";
import { listGroups, readGroup, createNewGroup, editGroup } from "@/server/services/agent/groups";
import {
  listExpenses,
  readExpense,
  previewExpense,
  addExpense,
  editExpense,
  deleteExpense,
} from "@/server/services/agent/expenses";
import {
  recordPayment,
  deletePayment,
  readPayment,
  listPayments,
  editPayment,
} from "@/server/services/agent/settlements";
import {
  transactionQuery,
  expenseInput,
  expenseQuery,
  groupInput,
  groupPatch,
  friendInput,
  settlementInput,
} from "@/server/agent/schemas";
import { once } from "@/server/idempotency";
import { expireSnapshot } from "@/server/cache-tags";
import { limits } from "@/server/request-guard";
import { RateLimitError } from "@/server/errors";
import type { McpRuntime } from "@/server/mcp/server";

const result = (data: unknown, message: string) => ({ data, message });

export const mcpRuntime: McpRuntime = {
  execute: async (tool, args, identity, requestId) => {
    const userId = identity.userId;
    const id = String(args.id ?? "");
    switch (tool) {
      case "get_context": {
        const view = await contextView(userId);
        return {
          ...view,
          data: {
            ...view.data,
            agent: { name: identity.agentName, keyId: identity.apiKeyId, scopes: identity.scopes },
          },
        };
      }
      case "get_balances":
        return balancesView(userId);
      case "list_transactions":
        return listEntries(userId, transactionQuery.parse(args));
      case "get_transaction":
        return readEntry(userId, id);
      case "create_transaction":
        return saveEntries(userId, {
          ...args,
          externalId: `mcp:${identity.apiKeyId}:${createHash("sha256").update(requestId!).digest("hex")}`,
        });
      case "update_transaction":
        return editEntry(userId, id, args);
      case "delete_transaction":
        return deleteEntry(userId, id);
      case "list_friends":
        return listFriends(userId);
      case "create_friends":
        return addFriends(userId, friendInput.parse(args));
      case "rename_friend":
        await renamePerson(userId, id, String(args.name));
        return result({ id }, "Friend renamed.");
      case "delete_friend":
        await deletePerson(userId, id);
        return result({ id }, "Friend removed.");
      case "list_groups":
        return listGroups(userId);
      case "get_group":
        return readGroup(userId, String(args.group));
      case "create_group":
        return createNewGroup(userId, groupInput.parse(args));
      case "update_group":
        return editGroup(userId, String(args.group), groupPatch.parse(args));
      case "delete_group":
        await deleteGroup(userId, id);
        return result({ id }, "Group removed.");
      case "leave_group":
        await leaveGroup(userId, id);
        return result({ id }, "Left the group.");
      case "list_expenses":
        return listExpenses(userId, expenseQuery.parse(args));
      case "get_expense":
        return readExpense(userId, id);
      case "preview_expense":
        return previewExpense(userId, expenseInput(todayInKathmandu()).parse(args));
      case "create_expense":
        return addExpense(userId, expenseInput(todayInKathmandu()).parse(args), true);
      case "update_expense":
        return editExpense(userId, id, args, true);
      case "delete_expense":
        return deleteExpense(userId, id, true);
      case "list_settlements":
        return listPayments(userId, args);
      case "get_settlement":
        return readPayment(userId, id);
      case "create_settlement":
        return recordPayment(userId, settlementInput(todayInKathmandu()).parse(args), true);
      case "update_settlement":
        return editPayment(userId, id, args, true);
      case "delete_settlement":
        return deletePayment(userId, id, true);
      case "list_accounts":
        return result({ accounts: await listAccounts(userId) }, "Accounts loaded.");
      case "create_account":
        return result({ account: await createAccount(userId, String(args.name)) }, "Account created.");
      case "rename_account":
        return result({ account: await renameAccount(userId, id, String(args.name)) }, "Account renamed.");
      case "delete_account":
        await deleteAccount(userId, id);
        return result({ id }, "Unused account removed.");
      case "list_categories":
        return result({ categories: await listCategories(userId) }, "Categories loaded.");
      case "create_category":
        return result({ category: await createCategory(userId, categorySchema.parse(args)) }, "Category created.");
      case "update_category":
        return result({ category: await updateCategory(userId, id, categorySchema.parse(args)) }, "Category updated.");
      case "delete_category":
        await deleteCategory(userId, id);
        return result({ id }, "Unused category removed.");
      case "list_agent_activity":
        return result(
          { operations: await listAgentOperations(userId, Number(args.limit ?? 50), identity.apiKeyId) },
          "This agent's mutation history loaded.",
        );
    }
    throw new Error(`Unknown MCP tool: ${tool}`);
  },
  once: async (identity, tool, requestId, args, run) =>
    once(identity.userId, `mcp:${identity.apiKeyId}:${tool}`, requestId, args, run),
  limit: (identity: AgentIdentity) => {
    for (const [limiter, key] of [
      [limits.agentWrites, identity.userId],
      [limits.agentKeyWrites, identity.apiKeyId!],
    ] as const) {
      const taken = limiter.take(key);
      if (!taken.ok)
        throw new RateLimitError(
          "This agent's write limit is reached. Retry after the indicated delay.",
          taken.retryAfter,
        );
    }
  },
  beginOperation: beginAgentOperation,
  finishOperation: finishAgentOperation,
  expire: expireSnapshot,
};
