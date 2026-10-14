import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, hours, nextPeriod, parseHolidays, periodFor, previousPeriod, roundTime, timesheet, workweekStart, type Punch } from "../src/lib/payroll";

test("periods: weekly and every two weeks count from the anchor, either side of it", () => {
  assert.deepEqual(periodFor("2026-10-14", "weekly", "2026-01-05"), { start: "2026-10-12", end: "2026-10-18" });
  assert.deepEqual(periodFor("2026-10-14", "biweekly", "2026-01-05"), { start: "2026-10-12", end: "2026-10-25" });
  assert.deepEqual(periodFor("2026-10-11", "biweekly", "2026-01-05"), { start: "2026-09-28", end: "2026-10-11" });
  assert.deepEqual(periodFor("2025-12-31", "biweekly", "2026-01-05"), { start: "2025-12-22", end: "2026-01-04" });
});

test("periods: twice a month and monthly follow the calendar, including February and leap years", () => {
  assert.deepEqual(periodFor("2026-02-20", "semimonthly", "2026-01-05"), { start: "2026-02-16", end: "2026-02-28" });
  assert.deepEqual(periodFor("2028-02-20", "semimonthly", "2026-01-05"), { start: "2028-02-16", end: "2028-02-29" });
  assert.deepEqual(periodFor("2026-10-15", "semimonthly", "2026-01-05"), { start: "2026-10-01", end: "2026-10-15" });
  assert.deepEqual(periodFor("2026-12-09", "monthly", "2026-01-05"), { start: "2026-12-01", end: "2026-12-31" });
  const p = periodFor("2026-10-14", "semimonthly", "x");
  assert.deepEqual(previousPeriod(p, "semimonthly", "x"), { start: "2026-09-16", end: "2026-09-30" });
  assert.deepEqual(nextPeriod(p, "semimonthly", "x"), { start: "2026-10-16", end: "2026-10-31" });
});

test("workweek start for Monday and Sunday weeks", () => {
  assert.equal(workweekStart("2026-10-14", 1), "2026-10-12"); // Wednesday → Monday
  assert.equal(workweekStart("2026-10-14", 7), "2026-10-11"); // Wednesday → Sunday
  assert.equal(workweekStart("2026-10-11", 7), "2026-10-11"); // Sunday starts its own week
  assert.equal(workweekStart("2026-10-11", 1), "2026-10-05"); // Sunday is the end of a Monday week
});

test("rounding goes to the nearest step, both ways", () => {
  const base = Date.parse("2026-10-14T12:00:00Z");
  assert.equal(roundTime(base + 7 * 60_000, 15), base);
  assert.equal(roundTime(base + 8 * 60_000, 15), base + 15 * 60_000);
  assert.equal(roundTime(base + 7 * 60_000 + 1234, 0), base + 7 * 60_000 + 1234);
});

const punch = (id: string, start: string, end: string | null, meal = 0, homeId = "h1"): Punch => ({ id, clockInAt: new Date(start), clockOutAt: end ? new Date(end) : null, mealMinutes: meal, homeId, home: homeId === "h1" ? "Hillcrest" : "Maple" });
const rules = { rounding: 0, overtimeAfterHours: 40, weekStartsOn: 1, holidays: new Map<string, string>() };

test("overtime is the time past 40 hours in the workweek, taken in order", () => {
  // Five 9-hour days Monday to Friday (Central): 45 hours, so the last day has 5 hours overtime.
  const week = ["12", "13", "14", "15", "16"].map(d => punch(d, `2026-10-${d}T12:00:00Z`, `2026-10-${d}T21:00:00Z`));
  const sheet = timesheet(week, { start: "2026-10-12", end: "2026-10-18" }, rules);
  assert.equal(sheet.totals.total, 45 * 60);
  assert.equal(sheet.totals.overtime, 5 * 60);
  assert.equal(sheet.lines[4].overtime, 5 * 60);
  assert.equal(sheet.lines[3].overtime, 0);
});

test("a workweek split across two periods gives each period its own share", () => {
  const week = ["12", "13", "14", "15", "16"].map(d => punch(d, `2026-10-${d}T12:00:00Z`, `2026-10-${d}T21:00:00Z`));
  const first = timesheet(week, { start: "2026-10-01", end: "2026-10-15" }, rules);
  const second = timesheet(week, { start: "2026-10-16", end: "2026-10-31" }, rules);
  assert.equal(first.totals.overtime, 0);
  assert.equal(first.totals.total, 36 * 60);
  assert.equal(second.totals.overtime, 5 * 60);
  assert.equal(second.totals.regular, 4 * 60);
});

test("meal breaks, open punches, holidays, homes and adjustments", () => {
  const punches = [punch("a", "2026-11-26T13:00:00Z", "2026-11-26T21:30:00Z", 30), punch("b", "2026-11-27T13:00:00Z", null), punch("c", "2026-11-28T13:00:00Z", "2026-11-28T17:00:00Z", 0, "h2")];
  const sheet = timesheet(punches, { start: "2026-11-16", end: "2026-11-30" }, { ...rules, holidays: parseHolidays(["2026-11-26 Thanksgiving", "not a date"]) }, [{ minutes: 60, overtime: false }]);
  assert.equal(sheet.lines[0].minutes, 480);
  assert.equal(sheet.lines[0].holiday, "Thanksgiving");
  assert.equal(sheet.totals.holiday, 480);
  assert.equal(sheet.totals.open, 1);
  assert.equal(sheet.totals.total, 480 + 240 + 60);
  assert.deepEqual(sheet.byHome.map(row => [row.home, row.minutes]), [["Hillcrest", 480], ["Maple", 240]]);
});

test("hours and CSV cells", () => {
  assert.equal(hours(450), "7.50");
  assert.equal(hours(20), "0.33");
  assert.equal(csvCell("Smith, Jo"), '"Smith, Jo"');
  assert.equal(csvCell('Say "hi"'), '"Say ""hi"""');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-1.50"), "-1.50");
  assert.equal(csvCell(null), "");
});

test("early clock-ins can be paid from the shift start", () => {
  const early = { ...punch("e", "2026-10-14T11:45:00Z", "2026-10-14T20:00:00Z"), shiftStart: new Date("2026-10-14T12:00:00Z") };
  const period = { start: "2026-10-12", end: "2026-10-18" };
  assert.equal(timesheet([early], period, rules).totals.total, 495);
  assert.equal(timesheet([early], period, { ...rules, payFromShiftStart: true }).totals.total, 480);
  // A late clock-in is never moved earlier.
  const late = { ...punch("l", "2026-10-14T12:20:00Z", "2026-10-14T20:00:00Z"), shiftStart: new Date("2026-10-14T12:00:00Z") };
  assert.equal(timesheet([late], period, { ...rules, payFromShiftStart: true }).totals.total, 460);
});
