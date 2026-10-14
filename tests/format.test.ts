import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, age, dateKey, daysBetween, tzOffsetMinutes, weekStart, zonedTime } from "../src/lib/format";

test("dateKey renders Central time, not UTC", () => {
  // 03:30 UTC on 2 July is still 1 July (22:30 CDT) in Nashville.
  assert.equal(dateKey(new Date("2026-07-02T03:30:00Z")), "2026-07-01");
  assert.equal(dateKey(new Date("2026-07-02T05:30:00Z")), "2026-07-02");
});

test("zonedTime honours daylight saving", () => {
  assert.equal(zonedTime("2026-07-01", "08:00").toISOString(), "2026-07-01T13:00:00.000Z"); // CDT, UTC-5
  assert.equal(zonedTime("2026-01-15", "08:00").toISOString(), "2026-01-15T14:00:00.000Z"); // CST, UTC-6
  assert.equal(tzOffsetMinutes(new Date("2026-07-01T12:00:00Z")), -300);
});

test("shift boundaries on daylight saving transition days use the actual offset", () => {
  assert.equal(zonedTime("2026-03-08", "07:00").toISOString(), "2026-03-08T12:00:00.000Z");
  assert.equal(zonedTime("2026-11-01", "07:00").toISOString(), "2026-11-01T13:00:00.000Z");
  assert.equal(zonedTime("2026-11-01", "00:00").toISOString(), "2026-11-01T05:00:00.000Z");
});

test("week starts on Monday and day arithmetic crosses months", () => {
  assert.equal(weekStart("2026-10-12"), "2026-10-12"); // a Monday
  assert.equal(weekStart("2026-10-18"), "2026-10-12"); // Sunday belongs to the week before
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(daysBetween("2026-10-12", "2026-10-03"), -9);
});

test("age counts completed years only", () => {
  assert.equal(age("2000-10-13", "2026-10-12"), 25);
  assert.equal(age("2000-10-12", "2026-10-12"), 26);
  assert.equal(age(null), null);
});
