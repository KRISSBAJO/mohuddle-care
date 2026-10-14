import assert from "node:assert/strict";
import { test } from "node:test";
import { documentLink, NOTE_LIBRARY } from "../src/lib/note-library";
import { effectiveConfig, readExtraItems, type NoteItem, type RequirementRow } from "../src/lib/note-requirements";

const incident: NoteItem = { id: "i1", label: "Incident occurred", fieldType: "yes_no", options: [], unit: "", help: "", required: true, scope: "all", followUpOn: "Yes", followUpPrompt: "Briefly describe what happened.", followUpDocs: ["Incident report"] };
const plain: NoteItem = { id: "p1", label: "Fire door checked", fieldType: "yes_no", options: [], unit: "", help: "", required: true, scope: "home" };

const reader = (values: Record<string, string | string[]>) => ({
  get: (name: string) => (Array.isArray(values[name]) ? String((values[name] as string[])[0] ?? "") : String(values[name] ?? "")),
  getAll: (name: string) => (Array.isArray(values[name]) ? (values[name] as string[]) : values[name] ? [String(values[name])] : []),
});

test("the expected answer needs nothing more", () => {
  const form = reader({ "extra.i1": "No", "extra.p1": "Yes" });
  const result = readExtraItems([incident, plain], form.get, form.getAll);
  assert.ok("answers" in result);
  assert.equal(result.answers.length, 2);
  assert.equal(result.answers[0].followUp, undefined);
});

test("the follow-up answer must be explained, and documents are marked done or still to do", () => {
  const missing = reader({ "extra.i1": "Yes" });
  const refused = readExtraItems([incident], missing.get, missing.getAll);
  assert.ok("error" in refused && refused.error.includes("Briefly describe what happened."));

  const explained = reader({ "extra.i1": "Yes", "extra.i1.followUp": "Tasha slipped in the hall; no injury, ice pack given." });
  const saved = readExtraItems([incident], explained.get, explained.getAll);
  assert.ok("answers" in saved);
  assert.deepEqual(saved.answers[0].followUp, { prompt: "Briefly describe what happened.", note: "Tasha slipped in the hall; no injury, ice pack given.", docs: [{ label: "Incident report", done: false }] });

  const withDoc = reader({ "extra.i1": "Yes", "extra.i1.followUp": "Fall in the hall.", "extra.i1.doc": ["Incident report", "Not on the list"] });
  const done = readExtraItems([incident], withDoc.get, withDoc.getAll);
  assert.ok("answers" in done);
  assert.deepEqual(done.answers[0].followUp?.docs, [{ label: "Incident report", done: true }]);
});

test("questions without a follow-up behave as before", () => {
  const form = reader({ "extra.p1": "No" });
  const result = readExtraItems([plain], form.get, form.getAll);
  assert.ok("answers" in result);
  assert.equal(result.answers[0].followUp, undefined);
});

test("follow-up settings come through from the stored rows, only for yes or no questions", () => {
  const row = (extra: Partial<RequirementRow>): RequirementRow => ({ id: "r", scope: "all", kind: "item", section: "", enabled: true, required: true, label: "Q", fieldType: "yes_no", options: [], unit: "", help: "", sortOrder: 0, ...extra });
  const config = effectiveConfig([row({ id: "a", followUpOn: "No", followUpPrompt: "Why not?", followUpDocs: ["Form"] }), row({ id: "b", fieldType: "number", followUpOn: "Yes" }), row({ id: "c", enabled: false, followUpOn: "Yes" })]);
  assert.deepEqual(config.items.map(item => [item.id, item.followUpOn]), [["a", "No"], ["b", ""]]);
  assert.equal(config.items[0].followUpPrompt, "Why not?");
});

test("the library starts off-ready and links known documents", () => {
  assert.equal(NOTE_LIBRARY.length, 9);
  assert.ok(NOTE_LIBRARY.every(item => item.followUpPrompt && (item.followUpOn === "Yes" || item.followUpOn === "No")));
  assert.equal(documentLink("Incident report", "p1"), "/app/incidents/new?individual=p1");
  assert.equal(documentLink("Doctor encounter form", "p1"), "/app/individuals/p1?tab=appointments");
  assert.equal(documentLink("CP activity log", "p1"), null);
});
