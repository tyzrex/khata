import type { Metadata } from "next";
import { SyncPage } from "./view";

export const metadata: Metadata = { title: "Import and export" };

export default function Page() {
  return <SyncPage />;
}
