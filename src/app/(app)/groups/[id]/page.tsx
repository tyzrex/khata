import type { Metadata } from "next";
import { GroupsPage } from "../view";

export const metadata: Metadata = { title: "Groups" };

export default function Page() {
  return <GroupsPage />;
}
