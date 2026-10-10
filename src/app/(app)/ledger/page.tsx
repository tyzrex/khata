import type { Metadata } from "next";
import { LedgerPage } from "./view";

export const metadata: Metadata = { title: "Ledger" };

export default function Page() {
  return <LedgerPage />;
}
