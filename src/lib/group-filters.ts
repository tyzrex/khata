import type { FeedItem } from "@/components/splits/ledger-math";

/**
 * Search and filters for one group's activity feed.
 *
 * Kept pure and separate from the group view so it can be tested without a browser,
 * and so the scoping rule is enforced by construction rather than by convention:
 * `applyGroupFilters` is handed *one* group's items and has no access to any other
 * group's, so a filter here cannot reach across books. That is why the group id
 * never appears in the filter state — a shared link carries the group in the path,
 * and everything after `?` narrows what is already inside that one group.
 */

export const FEED_TYPES = ["all", "expense", "payment"] as const;
export type FeedType = (typeof FEED_TYPES)[number];

export type GroupFeedFilters = {
  /** Free text over description and note. */
  q: string;
  /** One of the shared categories, or "" for any. */
  category: string;
  /** A person id: expenses this person paid or took part in, payments they made or received. */
  member: string;
  type: FeedType;
  from: string;
  to: string;
};

export const EMPTY_GROUP_FEED_FILTERS: GroupFeedFilters = { q: "", category: "", member: "", type: "all", from: "", to: "" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Shape *and* substance: `2026-13-99` matches a regex but is not a day. */
function realDate(value: string): string {
  if (!DATE.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  const ok = probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
  return ok ? value : "";
}

/** Read filters out of the URL. Anything malformed is dropped rather than throwing. */
export function readGroupFeedFilters(params: URLSearchParams): GroupFeedFilters {
  const raw = params.get("q")?.trim() ?? "";
  const member = params.get("member")?.trim() ?? "";
  const category = params.get("category")?.trim() ?? "";
  const type = params.get("type")?.trim();
  const from = params.get("from")?.trim() ?? "";
  const to = params.get("to")?.trim() ?? "";
  return {
    q: raw.slice(0, 160),
    member: member.slice(0, 100),
    category: category.slice(0, 40),
    type: (FEED_TYPES as readonly string[]).includes(type ?? "") ? (type as FeedType) : "all",
    from: realDate(from),
    to: realDate(to),
  };
}

/**
 * Write filters back, leaving out anything at its default so the URL stays short
 * and a shared link only carries what the sender actually narrowed.
 */
export function writeGroupFeedFilters(query: URLSearchParams, filters: GroupFeedFilters): URLSearchParams {
  const next = new URLSearchParams(query);
  const set = (key: string, value: string) => (value ? next.set(key, value) : next.delete(key));
  set("q", filters.q);
  set("category", filters.category);
  set("member", filters.member);
  set("type", filters.type === "all" ? "" : filters.type);
  set("from", filters.from);
  set("to", filters.to);
  return next;
}

export function hasGroupFeedFilters(filters: GroupFeedFilters): boolean {
  return filters.q !== "" || filters.category !== "" || filters.member !== "" || filters.type !== "all" || filters.from !== "" || filters.to !== "";
}

/** A one-line summary for the "showing N of M" line and the reset affordance. */
export function describeGroupFeedFilters(filters: GroupFeedFilters): string[] {
  const parts: string[] = [];
  if (filters.q) parts.push(`matching “${filters.q}”`);
  if (filters.category) parts.push(filters.category);
  if (filters.type !== "all") parts.push(filters.type === "expense" ? "expenses only" : "payments only");
  if (filters.from || filters.to) parts.push(`${filters.from || "start"} to ${filters.to || "today"}`);
  return parts;
}

type FiltersOptions = { members: { id: string; name: string }[] };

/**
 * Narrow one group's feed, newest first. Sorting happens here rather than being
 * inherited from the caller so the result does not depend on the order the feed
 * arrived in. The member filter matches on names as well as ids so a link carrying
 * either survives a rename.
 */
export function applyGroupFilters(items: FeedItem[], filters: GroupFeedFilters, options: FiltersOptions): FeedItem[] {
  const needle = filters.q.trim().toLowerCase();
  const memberName = filters.member ? (options.members.find((member) => member.id === filters.member)?.name ?? "").toLowerCase() : "";
  const isMemberId = (id: string) => filters.member !== "" && id === filters.member;
  const isMemberName = (name: string) => memberName !== "" && name.toLowerCase().includes(memberName);

  return items
    .filter((item) => {
    if (filters.type === "expense" && item.kind !== "expense") return false;
    if (filters.type === "payment" && item.kind !== "settlement") return false;

    if (filters.from && item.date < filters.from) return false;
    if (filters.to && item.date > filters.to) return false;

    if (item.kind === "expense") {
      const { expense } = item;
      if (filters.category && (expense.category ?? "") !== filters.category) return false;
      if (filters.member && !isMemberId(expense.paidById) && !expense.splits.some((split) => isMemberId(split.personId) || isMemberName(split.name))) return false;
      if (needle) {
        const haystack = `${expense.description} ${expense.note ?? ""} ${expense.paidByName}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    }

    const { settlement } = item;
    if (filters.category) return false;
    if (filters.member && !isMemberId(settlement.fromPersonId) && !isMemberId(settlement.toPersonId) && !isMemberName(settlement.fromName) && !isMemberName(settlement.toName)) return false;
    if (needle) {
      const haystack = `${settlement.fromName} ${settlement.toName} ${settlement.note ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
