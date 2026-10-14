import assert from "node:assert/strict";
import { test } from "node:test";
import { assertShiftUpdate } from "../src/lib/shift-policy";

test("DSPs and nurses cannot confirm another person's shift or an unassigned shift", () => {
  for (const role of ["dsp", "nurse"]) {
    assert.throws(() => assertShiftUpdate({ role, staffId: "alice" }, { staffId: "bob", status: "scheduled" }, "confirmed"));
    assert.throws(() => assertShiftUpdate({ role, staffId: null }, { staffId: null, status: "scheduled" }, "confirmed"));
    assert.doesNotThrow(() => assertShiftUpdate({ role, staffId: "alice" }, { staffId: "alice", status: "scheduled" }, "confirmed"));
  }
});

test("managers can update assigned shifts, but cannot revive final states", () => {
  for (const role of ["admin", "coordinator"]) {
    assert.doesNotThrow(() => assertShiftUpdate({ role, staffId: null }, { staffId: "bob", status: "confirmed" }, "completed"));
    assert.throws(() => assertShiftUpdate({ role, staffId: null }, { staffId: "bob", status: "completed" }, "confirmed"));
    assert.throws(() => assertShiftUpdate({ role, staffId: null }, { staffId: null, status: "open" }, "confirmed"));
  }
});

test("unknown status and deleted shifts are rejected", () => {
  assert.throws(() => assertShiftUpdate({ role: "admin", staffId: null }, { staffId: "bob", status: "scheduled" }, "open"));
  assert.throws(() => assertShiftUpdate({ role: "dsp", staffId: "alice" }, undefined, "confirmed"));
});
