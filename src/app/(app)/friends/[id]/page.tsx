import type { Metadata } from "next";
import { FriendsPage } from "../view";

export const metadata: Metadata = { title: "Friends" };

export default function Page() {
  return <FriendsPage />;
}
