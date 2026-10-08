import assert from "node:assert/strict";
import test from "node:test";
import { addDays } from "./dashboard";
import { adToBs, bsMonthLength, bsToAd, dateView, monthRange, shiftMonth, shiftYear } from "./nepali-date";
import { yearRange } from "./nepali-date";

test("converts between AD and BS at known anchors", () => {
  assert.deepEqual(adToBs("2026-04-14"), { year: 2083, month: 1, day: 1 });
  assert.equal(bsToAd(2083, 1, 1), "2026-04-14");
  assert.deepEqual(adToBs("2024-04-13"), { year: 2081, month: 1, day: 1 });
  assert.equal(adToBs("2024-04-12")?.month, 12);
});

// Eight years of daily conversions: slow under load, so it gets its own budget instead of the 5s default.
test("every day round-trips through BS", { timeout: 30_000 }, () => {
  let date = "2020-01-01";
  for (let index = 0; index < 366 * 8; index += 1) {
    const bs = adToBs(date);
    assert.ok(bs, date);
    assert.equal(bsToAd(bs.year, bs.month, bs.day), date);
    date = addDays(date, 1);
  }
});

test("BS months and years are bounded by their own calendar", () => {
  const month = monthRange("2026-10-08", "BS");
  const bs = adToBs("2026-10-08")!;
  assert.equal(adToBs(month.start)?.day, 1);
  assert.equal(adToBs(month.end)?.day, bsMonthLength(bs.year, bs.month));
  assert.equal(adToBs(addDays(month.end, 1))?.day, 1);
  const year = yearRange("2026-10-08", "BS");
  assert.deepEqual(adToBs(year.start), { year: bs.year, month: 1, day: 1 });
  assert.equal(adToBs(addDays(year.end, 1))?.year, bs.year + 1);
});

test("shifting by month or year lands in the right BS period", () => {
  const bs = adToBs("2026-10-08")!;
  const next = adToBs(shiftMonth("2026-10-08", 1, "BS"))!;
  assert.equal(next.day, 1);
  assert.equal(next.month, bs.month === 12 ? 1 : bs.month + 1);
  assert.equal(adToBs(shiftMonth("2026-04-20", -3, "BS"))?.year, 2082);
  assert.equal(adToBs(shiftYear("2026-10-08", 1, "BS"))?.year, bs.year + 1);
  assert.equal(shiftMonth("2026-01-15", -1, "AD"), "2025-12-01");
  assert.equal(shiftYear("2024-02-29", 1, "AD"), "2025-02-28");
});

test("views name the date in the chosen calendar and script", () => {
  const en = dateView("2026-04-14", { calendar: "BS", script: "en" });
  assert.equal(en.monthLong, "Baishakh");
  assert.equal(en.day, 1);
  assert.equal(en.weekdayShort, "Tue");
  const np = dateView("2026-04-14", { calendar: "BS", script: "np" });
  assert.equal(np.monthLong, "वैशाख");
  assert.equal(np.num(2083), "२०८३");
  assert.equal(dateView("2026-10-08").monthShort, "Oct");
});
