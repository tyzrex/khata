import type { Metadata } from "next";
import { ActivityPage } from "./view";

export const metadata: Metadata = { title: "Activity" };

export default function Page() {
  return <ActivityPage />;
}
