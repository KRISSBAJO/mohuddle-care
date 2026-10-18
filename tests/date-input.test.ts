import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDays, clockValue, moveMonth, parseClock, validDay } from "../mobile/src/lib/date-input";
test("calendar helper preserves leap days, month boundaries and Monday alignment", () => {
  assert.equal(validDay("2028-02-29"), true); assert.equal(validDay("2026-02-29"), false);
  assert.equal(validDay("2026-13-01"), false); assert.equal(validDay("2026-10-32"), false);
  assert.equal(calendarDays("2026-06")[0], "2026-06-01");
  assert.equal(calendarDays("2026-02").filter(Boolean).length, 28);
  assert.equal(calendarDays("2028-02").filter(Boolean).length, 29);
  assert.equal(moveMonth("2026-12", 1), "2027-01"); assert.equal(moveMonth("2026-01", -1), "2025-12");
});
test("time helpers preserve midnight, noon and individual minutes", () => {
  assert.deepEqual(parseClock("00:00"), { hour: 0, minute: 0 });
  assert.deepEqual(parseClock("12:07"), { hour: 12, minute: 7 });
  assert.equal(parseClock("24:00"), null); assert.equal(parseClock("12:60"), null);
  assert.equal(clockValue(0, 7), "00:07"); assert.equal(clockValue(23, 59), "23:59");
});
