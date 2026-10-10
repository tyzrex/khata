import type { Metadata } from "next";
import { AccountsPage } from "./view";

export const metadata: Metadata = { title: "Accounts" };

export default function Page() {
  return <AccountsPage />;
}