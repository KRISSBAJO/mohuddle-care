import assert from "node:assert/strict";
import { test } from "node:test";
import { documentedCount, earliestStart, goalProgress, periodStart } from "../src/lib/goal-progress";

test("periods start on the day, the Monday, or the first of the month", () => {
  assert.equal(periodStart("day", "2026-10-14"), "2026-10-14");
  assert.equal(periodStart("week", "2026-10-14"), "2026-10-12");
  assert.equal(periodStart("month", "2026-10-14"), "2026-10-01");
  assert.equal(earliestStart(["day", "week", null, "month"], "2026-10-14"), "2026-10-01");
});

test("only days inside the current period count", () => {
  const days = ["2026-10-09", "2026-10-12", "2026-10-13", "2026-10-15"];
  assert.equal(documentedCount(days, "week", "2026-10-14"), 2);
  assert.equal(documentedCount(days, "month", "2026-10-14"), 3);
  assert.equal(documentedCount(days, "day", "2026-10-13"), 1);
});

test("progress reads plainly, with or without a target", () => {
  assert.deepEqual(goalProgress(["2026-10-12"], 3, "week", "2026-10-14"), { count: 1, target: 3, period: "week", met: false, label: "Documented 1 of 3 this week" });
  assert.equal(goalProgress(["2026-10-12", "2026-10-13", "2026-10-14"], 3, "week", "2026-10-14").met, true);
  assert.equal(goalProgress(["2026-10-01"], null, null, "2026-10-14").label, "Worked on 0 times this week");
  assert.equal(goalProgress(["2026-10-01"], 8, "month", "2026-10-14").label, "Documented 1 of 8 this month");
});
