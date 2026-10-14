import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanDraft, filledCount, scribePrompt, scribeSchema } from "../src/lib/scribe";

test("the schema asks for every field with the right type", () => {
  const schema = scribeSchema("daily");
  assert.deepEqual((schema.properties.mood as { enum: string[] }).enum, ["great", "good", "okay", "low", "distressed"]);
  assert.deepEqual((schema.properties.fluidsOz as { type: string[] }).type, ["number", "null"]);
  assert.ok(schema.required.includes("notes"));
  assert.ok(Object.keys(scribeSchema("community").properties).includes("learning"));
});

test("the prompt names the person and forbids invention", () => {
  const prompt = scribePrompt("daily", { person: "Sam Lee" });
  assert.match(prompt, /Sam Lee/);
  assert.match(prompt, /Never invent/);
});

test("model answers are checked field by field", () => {
  const draft = cleanDraft("daily", {
    mood: "ecstatic",
    meals: "  Ate all of breakfast.  ",
    fluidsOz: 9999,
    sleepHours: 7.25,
    behaviourOccurred: false,
    behaviours: "Should be dropped",
    notes: 42,
    surprise: "ignored",
  });
  assert.equal(draft.mood, null);
  assert.equal(draft.meals, "Ate all of breakfast.");
  assert.equal(draft.fluidsOz, null);
  assert.equal(draft.sleepHours, 7.3);
  assert.equal(draft.behaviours, "");
  assert.equal(draft.notes, "");
  assert.equal("surprise" in draft, false);
  assert.equal(filledCount(draft), 2);
});

test("behaviour details stay when a behaviour was described", () => {
  const draft = cleanDraft("daily", { behaviourOccurred: true, behaviours: "Yelled for two minutes.", intervention: "Offered space." });
  assert.equal(draft.behaviours, "Yelled for two minutes.");
  assert.equal(draft.intervention, "Offered space.");
});
