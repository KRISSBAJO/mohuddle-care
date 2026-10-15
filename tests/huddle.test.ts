import assert from "node:assert/strict";
import { test } from "node:test";
import { huddleHighlights, huddleScript, type Huddle } from "../src/lib/huddle";

const person = (name: string, extra: Partial<Huddle["people"][number]> = {}): Huddle["people"][number] => ({
  id: name,
  name,
  fullName: `${name} Lee`,
  allergies: "",
  diet: "",
  mobility: "",
  supportNotes: "",
  doses: [],
  appointments: [],
  incidents: [],
  handoverNote: "",
  goals: [],
  ...extra,
});

const huddle: Huddle = {
  home: "Hillcrest House",
  state: "on",
  start: "2026-10-14T12:00:00Z",
  end: "2026-10-14T20:00:00Z",
  people: [
    person("Aisha", { allergies: "Penicillin", doses: [{ at: "2026-10-14T13:00:00Z", name: "Sertraline", dose: "50 mg", late: true }], goals: [{ title: "Cook a meal", label: "Documented 0 of 3 this week" }] }),
    person("Sam", { appointments: [{ at: "2026-10-14T15:30:00Z", what: "Dental with Dr Kim", escort: null }], doses: [{ at: "2026-10-14T17:00:00Z", name: "Metformin", dose: "500 mg", late: false }] }),
    person("Devon", { incidents: [{ at: "2026-10-13T10:00:00Z", category: "fall", severity: "low", open: true }] }),
  ],
  handover: { from: "Jamal Carter", at: "2026-10-14T11:55:00Z", note: "Quiet morning. Back door lock sticks.", incident: "not_reported" },
};

test("highlights put late doses and allergies first", () => {
  const lines = huddleHighlights(huddle);
  assert.equal(lines[0], "Late doses: Aisha's Sertraline.");
  assert.equal(lines[1], "Allergies: Aisha (Penicillin).");
  assert.match(lines[2], /Sam: Dental with Dr Kim at 10:30 AM, no escort yet/);
  assert.equal(lines[3], "Recent incidents to be aware of: Devon.");
  assert.match(lines[4], /not reported/);
});

test("the spoken briefing names everyone and ends with the handover", () => {
  const script = huddleScript(huddle);
  assert.match(script, /^Your huddle for Hillcrest House\. You are supporting Aisha, Sam and Devon\./);
  assert.match(script, /Doses coming up: Sam's Metformin at 12:00 PM\./);
  assert.match(script, /Plan goals to work on: Aisha, cook a meal, documented 0 of 3 this week\./);
  assert.match(script, /From the last handover by Jamal Carter: Quiet morning\. Back door lock sticks\.$/);
});

test("an empty home says so", () => {
  assert.match(huddleScript({ ...huddle, people: [], handover: null }), /Nobody lives at this home right now\.$/);
});
