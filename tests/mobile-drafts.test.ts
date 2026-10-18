import assert from "node:assert/strict";
import { test } from "node:test";
import { createDraftStore } from "../mobile/src/lib/draft-store";
import { createDraftRepository, draftKey } from "../mobile/src/lib/draft-catalog";

function fixture() {
  const values = new Map<string, string>();
  let fail = false;
  const store = createDraftStore({
    read: async key => values.get(key) ?? null,
    write: async (key, value) => { if (fail && key.endsWith(".1")) throw new Error("disk full"); assert.ok(Buffer.byteLength(value) < 2000); values.set(key, value); },
    remove: async key => { values.delete(key); },
  });
  return { store, values, fail: () => { fail = true; } };
}
test("long multilingual notes recover after a fresh store opens", async () => {
  const { store, values } = fixture();
  const value = { notes: "Care 🫶🏽 日本語 ".repeat(4000), checks: ["food", "sleep"] };
  await store.write("staff.agency.person", value);
  const reopened = createDraftStore({ read: async key => values.get(key) ?? null, write: async () => {}, remove: async () => {} });
  assert.deepEqual(await reopened.read("staff.agency.person"), value);
});
test("failed writes preserve the complete previous draft", async () => {
  const f = fixture();
  await f.store.write("draft", { notes: "original" });
  f.fail();
  await assert.rejects(f.store.write("draft", { notes: "replacement".repeat(300) }));
  assert.deepEqual(await f.store.read("draft"), { notes: "original" });
});
test("writes and clear are ordered; users and agencies cannot share drafts", async () => {
  const { store, values } = fixture();
  await Promise.all([store.write("a.agency.person", { n: 1 }), store.write("a.agency.person", { n: 2 }), store.write("b.agency.person", { n: 3 })]);
  assert.deepEqual(await store.read("a.agency.person"), { n: 2 });
  assert.equal(await store.read("a.other.person"), null);
  await store.clear("a.agency.person");
  assert.equal(await store.read("a.agency.person"), null);
  assert.deepEqual(await store.read("b.agency.person"), { n: 3 });
  assert.ok(![...values.keys()].some(key => key.startsWith("a.agency.person")));
});
test("Notes lists unsent drafts by account and agency, and removes submitted drafts", async () => {
  const { store } = fixture(); const drafts = createDraftRepository(store);
  const key = draftKey("alice", "agency-a", "note", "person.shift");
  await Promise.all([
    drafts.write(key, { form: { person: { id: "person", name: "TEST person" } }, fields: { notes: "Not submitted" } }),
    drafts.write(draftKey("alice", "agency-a", "community", "new"), { individualId: "person", note: "Community draft" }),
    drafts.write(draftKey("bob", "agency-a", "community", "new"), { note: "Other user" }),
  ]);
  assert.equal((await drafts.listNoteDrafts("alice", "agency-a")).length, 2);
  assert.equal((await drafts.listNoteDrafts("alice", "agency-b")).length, 0);
  assert.equal((await drafts.listNoteDrafts("bob", "agency-a")).length, 1);
  await drafts.clear(key);
  const remaining = await drafts.listNoteDrafts("alice", "agency-a");
  assert.equal(remaining.length, 1); assert.equal(remaining[0].kind, "community");
});
test("Notes discovers community and known shift drafts from the earlier OTA", async () => {
  const { store } = fixture();
  await store.write(draftKey("alice", "agency-a", "community", "new"), { individualId: "person", note: "Earlier draft" });
  await store.write(draftKey("alice", "agency-a", "note", "person.unscheduled"), { fields: { notes: "Earlier shift draft" }, form: { person: { id: "person", name: "TEST" } } });
  const drafts = createDraftRepository(store);
  const found = await drafts.listNoteDrafts("alice", "agency-a", ["person.unscheduled"]);
  assert.deepEqual(new Set(found.map(item => item.kind)), new Set(["note", "community"]));
  assert.equal((await drafts.listNoteDrafts("alice", "agency-a", ["person.unscheduled"])).length, 2);
});
