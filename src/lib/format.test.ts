import assert from "node:assert/strict";
import test from "node:test";
import { formatAmount, formatForeign, formatNpr, formatRate } from "./format";

test("whole rupees stay bare and paisa always shows two digits", () => {
  assert.equal(formatNpr(2970), "NPR 2,970");
  assert.equal(formatNpr(2970.5), "NPR 2,970.50");
  assert.equal(formatNpr(2970.05), "NPR 2,970.05");
  assert.equal(formatNpr(123456.789), "NPR 1,23,456.79");
  assert.equal(formatAmount(-1500.4), "1,500.40");
});

test("direction prefixes use a true minus sign", () => {
  assert.equal(formatNpr(-50), "−NPR 50");
  assert.equal(formatNpr(50, "out"), "−NPR 50");
  assert.equal(formatNpr(50, "in"), "+NPR 50");
});

test("values that round to whole rupees do not show .00", () => {
  assert.equal(formatNpr(99.999), "NPR 100");
  assert.equal(formatNpr(0.004), "NPR 0");
});

test("a foreign amount keeps its own symbol, and an unknown code stands in for itself", () => {
  assert.equal(formatForeign(20, "USD"), "$20");
  assert.equal(formatForeign(20.5, "USD"), "$20.50");
  assert.equal(formatForeign(1250, "INR"), "₹1,250");
  assert.equal(formatForeign(500, "XYZ"), "XYZ 500");
});

test("a rate keeps only the decimals that mean something", () => {
  assert.equal(formatRate(134), "134");
  assert.equal(formatRate(134.25), "134.25");
  assert.equal(formatRate(0.0123), "0.0123");
});
