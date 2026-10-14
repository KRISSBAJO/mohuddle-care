import assert from "node:assert/strict";
import { test } from "node:test";
import { billableMinutes, durationWords, overlaps, parseCommunityNote } from "../src/lib/community-note";

const rules = { today: "2026-10-14", noteMin: 20, costCenters: ["Day services"] };
const form = (values: Record<string, string>) => new URLSearchParams({
  noteDate: "2026-10-14",
  startTime: "10:00",
  endTime: "12:15",
  location: "Public library on Main Street",
  activity: "Story time and choosing books",
  note: "Chose two books and checked them out with her own card.",
  attest: "on",
  ...values,
});

test("billable time comes from the start and end", () => {
  assert.equal(billableMinutes("10:00", "12:15"), 135);
  assert.equal(billableMinutes("12:00", "10:00"), null);
  assert.equal(durationWords(135), "2 h 15 min");
  assert.equal(durationWords(45), "45 min");
  assert.equal(durationWords(120), "2 h");
  assert.equal(overlaps({ startTime: "10:00", endTime: "11:00" }, { startTime: "10:30", endTime: "12:00" }), true);
  assert.equal(overlaps({ startTime: "10:00", endTime: "11:00" }, { startTime: "11:00", endTime: "12:00" }), false);
});

test("a complete note is accepted with its minutes", () => {
  const result = parseCommunityNote(form({ trips: "2", costCenter: "Day services" }), rules);
  assert.ok("note" in result);
  assert.equal(result.note.minutes, 135);
  assert.equal(result.note.trips, 2);
});

test("problems come back in plain words", () => {
  const error = (values: Record<string, string>) => {
    const result = parseCommunityNote(form(values), rules);
    return "error" in result ? result.error : "";
  };
  assert.match(error({ noteDate: "2026-10-20" }), /future/);
  assert.match(error({ endTime: "09:00" }), /after the start/);
  assert.match(error({ trips: "-1" }), /trips/);
  assert.match(error({ costCenter: "Made up" }), /cost center/);
  assert.match(error({ location: "" }), /where/);
  assert.match(error({ note: "Fine." }), /20 characters/);
  assert.match(error({ attest: "" }), /accurate/);
});
