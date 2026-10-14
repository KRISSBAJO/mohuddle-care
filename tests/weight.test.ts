import assert from "node:assert/strict";
import { test } from "node:test";
import { bmi, bmiBand, fastChange, feetAndInches, rangeCheck } from "../src/lib/weight";

test("BMI from pounds and inches, with the CDC bands", () => {
  assert.equal(bmi(180, 70), 25.8);
  assert.equal(bmi(180, null), null);
  assert.equal(bmiBand(17).word, "Underweight");
  assert.equal(bmiBand(22).word, "Healthy weight");
  assert.equal(bmiBand(27).word, "Overweight");
  assert.equal(bmiBand(31).tone, "bad");
  assert.equal(feetAndInches(71), "5 ft 11 in");
});

test("range checks only count a range that is set", () => {
  assert.equal(rangeCheck(150, 160, 200), "below");
  assert.equal(rangeCheck(210, 160, 200), "above");
  assert.equal(rangeCheck(180, 160, 200), null);
  assert.equal(rangeCheck(300, null, null), null);
});

test("a fast change compares the earliest weighing in the period with the newest", () => {
  const weighings = [
    { day: "2026-08-01", pounds: 150 },
    { day: "2026-09-20", pounds: 200 },
    { day: "2026-10-01", pounds: 190 },
    { day: "2026-10-14", pounds: 180 },
  ];
  assert.deepEqual(fastChange(weighings, 30, 5), { from: { day: "2026-09-20", pounds: 200 }, to: { day: "2026-10-14", pounds: 180 }, percent: -10 });
  assert.equal(fastChange(weighings, 30, 15), null);
  assert.equal(fastChange([{ day: "2026-10-14", pounds: 180 }], 30, 5), null);
});
