import assert from "node:assert/strict";
import { test } from "node:test";
import { changesBetween, mayReview, noteRights, readNoteRefs, reviewFlags, type FlagKey } from "../src/lib/note-review";

const ALL: FlagKey[] = ["late", "no_punch", "outside_punch", "attention", "resubmitted"];
const hour = 3_600_000;
const base = { noteDay: "2026-10-14", writtenDay: "2026-10-14", start: 10 * hour, end: 14 * hour, attention: false, resubmitted: false };

test("a note inside its punch, written on the day, has no flags", () => {
  assert.deepEqual(reviewFlags({ ...base, punches: [{ in: 9.9 * hour, out: 14.1 * hour }] }, ALL, 15, 20 * hour), []);
});

test("punch checks: none, outside by more than the tolerance, and open punches", () => {
  assert.deepEqual(reviewFlags({ ...base, punches: [] }, ALL, 15, 20 * hour), ["no_punch"]);
  assert.deepEqual(reviewFlags({ ...base, punches: [{ in: 11 * hour, out: 14 * hour }] }, ALL, 15, 20 * hour), ["outside_punch"]);
  assert.deepEqual(reviewFlags({ ...base, punches: [{ in: 10.2 * hour, out: 14 * hour }] }, ALL, 15, 20 * hour), []);
  assert.deepEqual(reviewFlags({ ...base, punches: [{ in: 10 * hour, out: null }] }, ALL, 15, 15 * hour), []);
  assert.deepEqual(reviewFlags({ ...base, punches: null }, ALL, 15, 20 * hour), []);
});

test("other flags follow the settings", () => {
  const facts = { ...base, writtenDay: "2026-10-15", attention: true, resubmitted: true, punches: [] };
  assert.deepEqual(reviewFlags(facts, ALL, 15, 20 * hour), ["late", "no_punch", "attention", "resubmitted"]);
  assert.deepEqual(reviewFlags(facts, ["attention"], 15, 20 * hour), ["attention"]);
});

test("reviewers are the chosen roles or the home manager, never the writer", () => {
  const note = { writerStaffId: "s-writer", signedName: "Pat Lee", homeManagerStaffId: "s-manager" };
  assert.equal(mayReview({ role: "coordinator", staffId: "s-other", name: "A" }, note, ["admin", "coordinator"]), true);
  assert.equal(mayReview({ role: "dsp", staffId: "s-manager", name: "B" }, note, ["admin"]), true);
  assert.equal(mayReview({ role: "dsp", staffId: "s-other", name: "C" }, note, ["admin"]), false);
  assert.equal(mayReview({ role: "admin", staffId: "s-writer", name: "Pat Lee" }, note, ["admin"]), false);
  assert.equal(mayReview({ role: "admin", staffId: null, name: "Pat Lee" }, { ...note, writerStaffId: null }, ["admin"]), false);
});

test("what each person may do depends on the status", () => {
  const note = { writerStaffId: "s-writer", signedName: "Pat Lee", homeManagerStaffId: null };
  const admin = { role: "admin", staffId: null, name: "Admin" };
  const writer = { role: "dsp", staffId: "s-writer", name: "Pat Lee" };
  assert.deepEqual(noteRights(admin, { ...note, status: "submitted" }, ["admin"]), { reviewer: true, writer: false, approve: true, returnIt: true, edit: true, reopen: false });
  assert.equal(noteRights(admin, { ...note, status: "approved" }, ["admin"]).edit, false);
  assert.equal(noteRights(admin, { ...note, status: "approved" }, ["admin"]).reopen, true);
  assert.equal(noteRights(writer, { ...note, status: "submitted" }, ["admin"]).edit, false);
  assert.equal(noteRights(writer, { ...note, status: "returned" }, ["admin"]).edit, true);
});

test("edits list only what changed; bulk refs are checked", () => {
  assert.deepEqual(changesBetween({ notes: "Calm.", mood: "good" }, { notes: "Calm all day.", mood: "good" }, { notes: "Summary" }), [{ field: "Summary", before: "Calm.", after: "Calm all day." }]);
  const id = "4318d6f7-4f44-4e97-8601-3dee94b798ee";
  assert.deepEqual(readNoteRefs([`daily:${id}`, `daily:${id}`, "bad", `community:${id}`]), [{ kind: "daily", id }, { kind: "community", id }]);
});

test("copied notes are found by shared three-word runs; short notes are not compared", async () => {
  const { closestCopy, shingles, similarity } = await import("../src/lib/note-review");
  const base = "Aisha woke at seven, ate all of her oatmeal and drank two cups of water. She took her morning medication and walked to the park with staff for thirty minutes.";
  const same = shingles(base);
  const edited = shingles(base.replace("thirty", "forty"));
  const different = shingles("Sam spent the morning at day program, then went to the library and picked two books. He ate half of his sandwich at lunch and called his sister.");
  assert.equal(similarity(same, shingles(base)), 100);
  assert.ok(similarity(same, edited) >= 85);
  assert.ok(similarity(same, different) < 10);
  assert.equal(shingles("Calm shift, no concerns.").size, 0);
  const match = closestCopy({ id: "a", runs: same }, [
    { id: "a", kind: "daily", person: "Aisha", day: "2026-10-14", runs: same },
    { id: "b", kind: "daily", person: "Sam", day: "2026-10-13", runs: different },
    { id: "c", kind: "daily", person: "Aisha", day: "2026-10-12", runs: edited },
  ], 85);
  assert.equal(match?.id, "c");
  assert.equal(closestCopy({ id: "a", runs: same }, [{ id: "b", kind: "daily", person: "Sam", day: "2026-10-13", runs: different }], 85), null);
});
