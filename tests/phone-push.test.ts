import assert from "node:assert/strict";
import { test } from "node:test";
import { phoneScreenFor } from "../src/lib/phone-screens";
import { PRIVATE_ALERT, pushWords } from "../src/lib/push-words";

const message = { title: "Jamal Carter has not clocked in", body: "Weekday evening at Hillcrest House" };

test("a private notification names nobody", () => {
  assert.deepEqual(pushWords("private", message), { title: "Mohuddle", body: PRIVATE_ALERT });
});

test("the title setting leaves out the details, the full setting sends both", () => {
  assert.deepEqual(pushWords("title", message), { title: message.title });
  assert.deepEqual(pushWords("full", message), message);
  assert.deepEqual(pushWords("full", { title: "Approved" }), { title: "Approved", body: undefined });
});

test("website links open the matching phone screen", () => {
  assert.equal(phoneScreenFor("/app/clock", false), "/clock");
  assert.equal(phoneScreenFor("/app/daily-logs/new?individual=abc", false), "/note?person=abc");
  assert.equal(phoneScreenFor("/app/tasks/0b9c2f4e-1111-4222-8333-944455556666", false), "/task?id=0b9c2f4e-1111-4222-8333-944455556666");
  assert.equal(phoneScreenFor("/app/clock/timesheets/2026-10-01", false), null);
  assert.equal(phoneScreenFor("", false), null);
  const id = "0b9c2f4e-1111-4222-8333-944455556666";
  assert.equal(phoneScreenFor(`/app/daily-logs/${id}`, false), `/note-record?kind=daily&id=${id}`);
  assert.equal(phoneScreenFor(`/app/community-notes/${id}`, false), `/note-record?kind=community&id=${id}`);
  assert.equal(phoneScreenFor("/app/community-notes/new", false), "/community-note");
  assert.equal(phoneScreenFor(`/app/individuals/${id}`, false), `/person?id=${id}`);
});

test("team and incident screens open only for managers", () => {
  const incident = "/app/incidents/0b9c2f4e-1111-4222-8333-944455556666";
  assert.equal(phoneScreenFor(incident, true), "/incident?id=0b9c2f4e-1111-4222-8333-944455556666");
  assert.equal(phoneScreenFor(incident, false), null);
  assert.equal(phoneScreenFor("/app/time", true), "/team");
  assert.equal(phoneScreenFor("/app/time", false), null);
});
