import assert from "node:assert/strict";
import test from "node:test";
import { formatAmount, formatNpr } from "./format";

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
