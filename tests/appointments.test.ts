import assert from "node:assert/strict";
import { test } from "node:test";
import { followUpState, visitState, type AppointmentLike } from "../src/lib/appointments";
import { dateKey } from "../src/lib/format";

const base: AppointmentLike = { status: "scheduled", scheduledAt: new Date("2026-10-14T15:00:00Z"), documentedAt: null, followUpNeeded: false, followUpBy: null, nextAppointmentId: null };
const at = (iso: string) => Date.parse(iso);

test("a booked visit is upcoming, then today, then needs documenting, then overdue", () => {
  assert.equal(visitState(base, at("2026-10-12T15:00:00Z"), 24, "2026-10-12", dateKey), "upcoming");
  assert.equal(visitState(base, at("2026-10-14T13:00:00Z"), 24, "2026-10-14", dateKey), "today");
  assert.equal(visitState(base, at("2026-10-14T16:00:00Z"), 24, "2026-10-14", dateKey), "to_document");
  assert.equal(visitState(base, at("2026-10-15T16:00:00Z"), 24, "2026-10-15", dateKey), "documentation_overdue");
  assert.equal(visitState({ ...base, status: "cancelled" }, at("2026-10-15T16:00:00Z"), 24, "2026-10-15", dateKey), "cancelled");
});

test("a follow-up stays open until the next visit is booked, and is overdue after its date", () => {
  const done = { ...base, status: "completed" as const, followUpNeeded: true, followUpBy: "2026-11-01" };
  assert.equal(followUpState(done, "2026-10-20"), "to_book");
  assert.equal(followUpState(done, "2026-11-02"), "overdue");
  assert.equal(followUpState({ ...done, nextAppointmentId: "x" }, "2026-11-02"), "booked");
  assert.equal(followUpState({ ...done, followUpNeeded: false }, "2026-11-02"), "none");
  assert.equal(followUpState(base, "2026-11-02"), "none", "only documented visits have follow-ups");
});
