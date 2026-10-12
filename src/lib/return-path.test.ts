import { describe, expect, test } from "bun:test";
import { safeNext } from "@/lib/return-path";

describe("safeNext", () => {
  test("keeps same-site paths, queries and hashes", () => {
    expect(safeNext("/ledger?type=expense#top")).toBe("/ledger?type=expense#top");
  });

  test.each(["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/ /evil.com", "/%09/evil.com".replace("%09", "\u0009"), "https://evil.com", "evil.com"])(
    "refuses %j",
    (value) => {
      expect(safeNext(value)).toBe("/");
    },
  );

  test("never sends someone back to the login page", () => {
    expect(safeNext("/login?next=/")).toBe("/");
  });

  test("falls back for empty values", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});
