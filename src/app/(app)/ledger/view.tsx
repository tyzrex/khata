"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useKhata } from "@/components/khata-provider";
import { Ledger } from "@/components/ledger";
import { filterTransactions, ledgerQuery, readLedgerFilters } from "@/lib/url-state";

/** Filters come from the URL, so a filtered view can be bookmarked or shared and survives a reload. */
export function LedgerPage() {
  const khata = useKhata();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readLedgerFilters(params);

  return (
    <Ledger
      transactions={filterTransactions(khata.ledger.transactions, filters)}
      categories={khata.ledger.categories}
      accounts={khata.ledger.accounts}
      filters={filters}
      links={khata.shares.book.links}
      onFilter={(next) => router.replace(`${pathname}${ledgerQuery(next)}`, { scroll: false })}
      onEdit={khata.openEdit}
      onAdd={khata.openAdd}
    />
  );
}
