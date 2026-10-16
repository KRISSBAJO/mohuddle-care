import assert from "node:assert/strict";
import { test } from "node:test";
import { prnSummary } from "../src/lib/medicines";
import { medicationFields } from "../src/server/forms";

test("a regular medicine needs times; an as-needed one needs when to give it, and has no times", () => {
  const base = { name: "Ibuprofen", dose: "200 mg", route: "oral" };
  assert.equal(medicationFields.safeParse({ ...base, times: "" }).success, false);
  assert.deepEqual(medicationFields.parse({ ...base, times: "20:00, 08:00" }).times, ["08:00", "20:00"]);

  const prn = medicationFields.parse({ ...base, times: "08:00", asNeeded: "on", prnUse: "For pain", prnMinHours: "4", prnMaxPerDay: "" });
  assert.deepEqual(prn.times, []);
  assert.equal(prn.asNeeded, true);
  assert.equal(prn.prnMinHours, 4);
  assert.equal(prn.prnMaxPerDay, null);
  assert.equal(medicationFields.safeParse({ ...base, asNeeded: "on", prnUse: "" }).success, false);
  assert.equal(medicationFields.safeParse({ ...base, asNeeded: "on", prnUse: "For pain", prnMinHours: "100" }).success, false);
});

test("as-needed medicines are described in plain words", () => {
  assert.equal(prnSummary({ prnUse: "For pain over 4 out of 10", prnMinHours: 4, prnMaxPerDay: 4 }), "As needed: for pain over 4 out of 10 · at least 4 hours apart · up to 4 in 24 hours");
  assert.equal(prnSummary({ prnUse: "For anxiety", prnMinHours: null, prnMaxPerDay: null }), "As needed: for anxiety");
});
