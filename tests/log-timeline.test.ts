import assert from "node:assert/strict";
import { test } from "node:test";
import { clockLabel, dosesByHour, hourDay, hourLabel, shiftHours, withDoses } from "../src/lib/log-note";

test("a shift covers each hour it touches, past midnight too", () => {
  assert.deepEqual(shiftHours("07:00", "11:00"), ["07:00", "08:00", "09:00", "10:00"]);
  assert.deepEqual(shiftHours("07:30", "09:15"), ["07:00", "08:00", "09:00"]);
  assert.deepEqual(shiftHours("23:00", "02:00"), ["23:00", "00:00", "01:00"]);
  assert.deepEqual(shiftHours("", "02:00"), []);
  assert.equal(hourDay("2026-10-14", "23:00", "01:00"), "2026-10-15");
  assert.equal(hourDay("2026-10-14", "23:00", "23:00"), "2026-10-14");
});

test("hours and clocks read plainly", () => {
  assert.equal(hourLabel("00:00"), "12 AM");
  assert.equal(hourLabel("13:00"), "1 PM");
  assert.equal(clockLabel("08:30"), "8:30 AM");
  assert.equal(clockLabel("12:05"), "12:05 PM");
});

test("doses land in the hour they are due, on the right day", () => {
  const doses = [
    { day: "2026-10-14", clock: "08:00", label: "Metformin 500 mg · Given" },
    { day: "2026-10-14", clock: "08:30", label: "Vitamin D 1000 IU · Not recorded yet" },
    { day: "2026-10-15", clock: "00:30", label: "Melatonin 3 mg · Given" },
    { day: "2026-10-13", clock: "08:00", label: "Yesterday's dose" },
  ];
  assert.deepEqual(dosesByHour(doses, "2026-10-14", "07:00", "10:00"), { "08:00": ["8:00 AM Metformin 500 mg · Given", "8:30 AM Vitamin D 1000 IU · Not recorded yet"] });
  assert.deepEqual(dosesByHour(doses, "2026-10-14", "22:00", "02:00"), { "00:00": ["12:30 AM Melatonin 3 mg · Given"] });
});

test("written lines and doses merge in shift order", () => {
  const merged = withDoses([{ hour: "09:00", note: "Walk to the park.", meds: ["forged"] }], { "08:00": ["8:00 AM Metformin"] }, "07:00", "10:00");
  assert.deepEqual(merged, [
    { hour: "08:00", note: "", meds: ["8:00 AM Metformin"] },
    { hour: "09:00", note: "Walk to the park.", meds: [] },
  ]);
});
