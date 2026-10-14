import assert from "node:assert/strict";
import { test } from "node:test";
import { dateKey } from "../src/lib/format";
import { dueBucket, relativeDue } from "../src/lib/tasks";

// 2026-10-14 10:00 Central is 15:00 UTC.
const now = Date.parse("2026-10-14T15:00:00Z");

test("tasks fall into the right due group in Central time", () => {
  assert.equal(dueBucket(null, now, dateKey), "none");
  assert.equal(dueBucket(new Date("2026-10-14T14:00:00Z"), now, dateKey), "overdue");
  assert.equal(dueBucket(new Date("2026-10-14T22:00:00Z"), now, dateKey), "today");
  assert.equal(dueBucket(new Date("2026-10-15T04:30:00Z"), now, dateKey), "today", "11:30 pm Central is still today");
  assert.equal(dueBucket(new Date("2026-10-15T20:00:00Z"), now, dateKey), "tomorrow");
  assert.equal(dueBucket(new Date("2026-10-19T20:00:00Z"), now, dateKey), "week");
  assert.equal(dueBucket(new Date("2026-11-30T20:00:00Z"), now, dateKey), "later");
});

test("due times read naturally", () => {
  assert.equal(relativeDue(new Date(now + 30 * 60_000), now), "in 30 min");
  assert.equal(relativeDue(new Date(now + 3 * 3_600_000), now), "in 3 h");
  assert.equal(relativeDue(new Date(now - 2 * 86_400_000), now), "2 days overdue");
  assert.equal(relativeDue(new Date(now + 86_400_000), now), "in 1 day");
});
