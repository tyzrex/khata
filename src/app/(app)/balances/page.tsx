import type { Metadata } from "next";
import { BalancesPage } from "./view";

export const metadata: Metadata = { title: "Balances" };

export default function Page() {
  return <BalancesPage />;
}
