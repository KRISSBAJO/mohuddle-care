import assert from "node:assert/strict";
import { test } from "node:test";
import { createDraftStore } from "../mobile/src/lib/draft-store";
import { createIncidentUploadStore } from "../mobile/src/lib/incident-upload-store";

function fixture() {
  const values = new Map<string, string>(); let fail = false;
  const store = createDraftStore({ read: async key => values.get(key) ?? null, write: async (key, value) => { if (fail) throw new Error("disk full"); values.set(key, value); }, remove: async key => { values.delete(key); } });
  return { store, queue: createIncidentUploadStore(store), fail: () => { fail = true; } };
}
const job = (reportId: string) => ({ reportId, date: "2026-10-18", time: "12:00", photos: [{ id: `${reportId}-photo`, uri: "encrypted-original", type: "image/jpeg" }] });
test("filed-photo recovery supports multiple reports alongside a new unsent draft", async () => {
  const { store, queue } = fixture();
  await queue.enqueue("alice.agency", job("first"));
  await store.write("new-report", { description: "Still writing" });
  await queue.enqueue("alice.agency", job("second"));
  const reopened = createIncidentUploadStore(store);
  assert.equal((await reopened.list("alice.agency")).length, 2);
  await reopened.confirmPhoto("alice.agency", "first", "first-photo");
  assert.deepEqual(await reopened.list("alice.agency"), [job("second")]);
  assert.deepEqual(await store.read("new-report"), { description: "Still writing" });
  assert.deepEqual(await reopened.list("bob.agency"), []);
  assert.deepEqual(await reopened.list("alice.other-agency"), []);
});
test("a stale filed draft cannot revive a confirmed photo after reopening", async () => {
  const { store, queue } = fixture();
  await queue.enqueue("queue", job("filed"));
  await queue.confirmPhoto("queue", "filed", "filed-photo");
  const reopened = createIncidentUploadStore(store);
  await reopened.enqueue("queue", job("filed"));
  assert.deepEqual(await reopened.list("queue"), []);
});
test("failed queue writes preserve outstanding photos and their retry identifiers", async () => {
  const { queue, fail } = fixture();
  await queue.enqueue("queue", job("filed")); fail();
  await assert.rejects(queue.confirmPhoto("queue", "filed", "filed-photo"));
  assert.deepEqual(await queue.list("queue"), [job("filed")]);
  await assert.rejects(queue.enqueue("queue", job("another")));
  assert.deepEqual(await queue.list("queue"), [job("filed")]);
});
