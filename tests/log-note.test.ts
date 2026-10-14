import assert from "node:assert/strict";
import { test } from "node:test";
import { isLateEntry, parseLogNote, shiftMinutes, type LogRules } from "../src/lib/log-note";

const GOAL = "11111111-1111-4111-8111-111111111111";
const rules: LogRules = {
  today: "2026-10-14",
  requiredChecks: ["Personal care supported", "Home safety walk"],
  summaryMin: 20,
  locations: ["At home", "In the community"],
  adlItems: ["Bathing or shower", "Toileting"],
  promptLevels: ["Independent", "Verbal prompt", "Full physical help"],
  activityTypes: ["Exercise", "Cooking"],
  goalIds: [GOAL],
};

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const item of [value].flat()) data.append(key, item);
  return data;
}

const valid = {
  logDate: "2026-10-14",
  shift: "day",
  timeIn: "07:00",
  timeOut: "15:00",
  location: "At home",
  mood: "good",
  checks: ["Personal care supported", "Home safety walk"],
  "adl.0": "Verbal prompt",
  "meal.Lunch": "Most",
  fluidsOz: "48",
  [`goal.${GOAL}.offered`]: "yes",
  [`goal.${GOAL}.prompt`]: "Verbal prompt",
  [`goal.${GOAL}.outcome`]: "progressing",
  [`goal.${GOAL}.attempts`]: "4",
  [`goal.${GOAL}.successes`]: "3",
  activityTypes: ["Cooking"],
  notes: "A calm day. Cooked lunch together and walked to the park.",
  attest: "on",
};

const errorOf = (values: Record<string, string | string[]>) => {
  const result = parseLogNote(form(values), rules);
  return "error" in result ? result.error : null;
};

test("a complete shift note is accepted and cleaned", () => {
  const result = parseLogNote(form(valid), rules);
  assert.ok("note" in result);
  assert.deepEqual(result.note.adl, { "Bathing or shower": "Verbal prompt" });
  assert.deepEqual(result.note.mealIntake, { Lunch: "Most" });
  assert.equal(result.note.fluidsOz, 48);
  assert.deepEqual(result.note.goals, [{ goalId: GOAL, offered: "yes", promptLevel: "Verbal prompt", outcome: "progressing", attempts: 4, successes: 3, note: "" }]);
  assert.equal(result.note.behaviours, "");
});

test("the note must be signed, summarised and fully checked", () => {
  assert.match(errorOf({ ...valid, attest: "" }) ?? "", /Confirm the note is accurate/);
  assert.match(errorOf({ ...valid, notes: "Fine." }) ?? "", /at least 20 characters/);
  assert.match(errorOf({ ...valid, checks: ["Personal care supported"] }) ?? "", /Missing: Home safety walk/);
});

test("dates, shifts and times are checked", () => {
  assert.match(errorOf({ ...valid, logDate: "2026-10-15" }) ?? "", /future/);
  assert.match(errorOf({ ...valid, shift: "night" }) ?? "", /which shift/);
  assert.match(errorOf({ ...valid, timeOut: "07:00" }) ?? "", /cannot be the same/);
  assert.match(errorOf({ ...valid, location: "Moon" }) ?? "", /where support was given/);
});

test("values outside the settings lists are refused", () => {
  assert.match(errorOf({ ...valid, "adl.1": "Whatever" }) ?? "", /support level for Toileting/);
  assert.match(errorOf({ ...valid, "meal.Dinner": "Lots" }) ?? "", /dinner/);
  assert.match(errorOf({ ...valid, activityTypes: ["Skydiving"] }) ?? "", /not an activity type/);
});

test("vitals must be in range and blood pressure must be complete", () => {
  assert.match(errorOf({ ...valid, pulse: "400" }) ?? "", /Pulse must be a whole number from 20 to 250/);
  assert.match(errorOf({ ...valid, bpSys: "120" }) ?? "", /both blood pressure numbers/);
  assert.match(errorOf({ ...valid, bpSys: "80", bpDia: "120" }) ?? "", /lower blood pressure/);
  const ok = parseLogNote(form({ ...valid, bpSys: "118", bpDia: "76", temp: "98.4" }), rules);
  assert.ok("note" in ok && ok.note.vitals.temp === 98.4 && ok.note.vitals.bpSys === 118);
});

test("a seizure or behaviour needs a description", () => {
  assert.match(errorOf({ ...valid, seizure: "on" }) ?? "", /Describe the seizure/);
  assert.match(errorOf({ ...valid, behaviourOccurred: "on", behaviours: "Shouted and hit the wall twice." }) ?? "", /what staff did/);
  const ok = parseLogNote(form({ ...valid, behaviourOccurred: "on", behaviours: "Shouted and hit the wall twice.", intervention: "Offered quiet room." }), rules);
  assert.ok("note" in ok && ok.note.intervention === "Offered quiet room.");
  const dropped = parseLogNote(form({ ...valid, behaviours: "left over text" }), rules);
  assert.ok("note" in dropped && dropped.note.behaviours === "");
});

test("goal data is required when a goal was worked on", () => {
  assert.match(errorOf({ ...valid, [`goal.${GOAL}.prompt`]: "" }) ?? "", /how much support/);
  assert.match(errorOf({ ...valid, [`goal.${GOAL}.successes`]: "9" }) ?? "", /more successes than attempts/);
  const skipped = parseLogNote(form({ ...valid, [`goal.${GOAL}.offered`]: "refused" }), rules);
  assert.ok("note" in skipped && skipped.note.goals[0].promptLevel === "" && skipped.note.goals[0].attempts === null);
});

test("shift length handles overnight and late entries are spotted", () => {
  assert.equal(shiftMinutes("07:00", "15:30"), 510);
  assert.equal(shiftMinutes("23:00", "07:00"), 480);
  assert.equal(shiftMinutes("7", "15:00"), null);
  assert.equal(isLateEntry("2026-10-13", "2026-10-14"), true);
  assert.equal(isLateEntry("2026-10-14", "2026-10-14"), false);
});

test("sections that are off are ignored, and required sections must be filled", () => {
  const off = parseLogNote(form({ ...valid, "meal.Lunch": "Most", bowelMovements: "2" }), { ...rules, sections: { meals: { on: false, required: false }, continence: { on: false, required: false } } });
  assert.ok("note" in off && Object.keys(off.note.mealIntake).length === 0 && off.note.bowelMovements === null, "meals off and continence off by default are dropped");
  assert.ok("note" in off && !off.note.sections.includes("meals"));
  const continence = { ...rules, sections: { continence: { on: true, required: true } } };
  assert.match(errorOf2(valid, continence) ?? "", /bowel and bladder/);
  const ok = parseLogNote(form({ ...valid, bowelMovements: "0", stoolType: "Type 4: smooth and soft" }), continence);
  assert.ok("note" in ok && ok.note.bowelMovements === 0 && ok.note.stoolType.startsWith("Type 4"));
  const seizure = { ...rules, sections: { seizure: { on: true, required: true } } };
  assert.match(errorOf2(valid, seizure) ?? "", /seizure watch/);
  assert.ok("note" in parseLogNote(form({ ...valid, seizureAnswer: "no" }), seizure));
  assert.match(errorOf2({ ...valid, seizureAnswer: "yes" }, seizure) ?? "", /Describe the seizure/);
  const care = { ...rules, sections: { care: { on: true, required: true } } };
  assert.match(errorOf2(valid, care) ?? "", /Toileting/);
});

test("extra items are checked against their type and kept with their label", () => {
  const items = [
    { id: "a", label: "Fire door checked?", fieldType: "yes_no" as const, options: [], unit: "", help: "", required: true, scope: "home" as const },
    { id: "b", label: "Weight", fieldType: "number" as const, options: [], unit: "lb", help: "", required: false, scope: "person" as const },
    { id: "c", label: "Skin areas checked", fieldType: "multi" as const, options: ["Heels", "Hips", "Back"], unit: "", help: "", required: false, scope: "person" as const },
  ];
  const withItems = { ...rules, items };
  assert.match(errorOf2(valid, withItems) ?? "", /Fire door checked/);
  assert.match(errorOf2({ ...valid, "extra.a": "Yes", "extra.b": "heavy" }, withItems) ?? "", /must be a number/);
  const ok = parseLogNote(form({ ...valid, "extra.a": "Yes", "extra.b": "142", "extra.c": ["Heels", "Elbows"] }), withItems);
  assert.ok("note" in ok);
  assert.deepEqual(ok.note.extra.map(answer => [answer.label, answer.value]), [["Fire door checked?", "Yes"], ["Weight", "142"], ["Skin areas checked", ["Heels"]]]);
});

function errorOf2(values: Record<string, string | string[]>, withRules: LogRules) {
  const result = parseLogNote(form(values), withRules);
  return "error" in result ? result.error : null;
}
