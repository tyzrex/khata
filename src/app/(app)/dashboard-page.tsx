"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useKhata } from "@/components/khata-provider";
import { Overview } from "@/components/overview";
import { addDays } from "@/lib/dashboard";
import { toast } from "@/lib/status";
import { dashboardQuery, readDashboardState } from "@/lib/url-state";

export function DashboardPage() {
  const khata = useKhata();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { today } = khata;
  const period = readDashboardState(params, today, { start: addDays(today, -29), end: today });

  return (
    <Overview
      transactions={khata.ledger.transactions}
      categories={khata.ledger.categories}
      accounts={khata.ledger.accounts}
      today={today}
      book={khata.shares.book}
      period={period}
      // Stepping through periods replaces the entry, so Back leaves the dashboard instead of walking every month.
      onPeriod={(next) => router.replace(`${pathname}${dashboardQuery(next, today)}`, { scroll: false })}
      onLedger={(href) => router.push(href ?? "/ledger")}
      onAdd={khata.openAdd}
      onEdit={khata.openEdit}
      onSplit={() => khata.openExpense(null)}
      onSample={async () => {
        const result = await khata.loadSample();
        toast.success(result.created ? "Sample week loaded" : "Sample week already in the ledger");
      }}
      onBalances={() => router.push("/balances")}
      onFriends={() => router.push("/friends")}
      onGroups={() => router.push("/groups")}
    />
  );
}
