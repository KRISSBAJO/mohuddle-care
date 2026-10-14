import assert from "node:assert/strict";
import { test } from "node:test";
import { toCsv } from "../src/lib/csv";

test("CSV cells are quoted, quotes doubled and formulas defused", () => {
  const csv = toCsv([["Name", "Note"], ["Hill, House", '=HYPERLINK("x")'], [null, 42]]);
  assert.ok(csv.startsWith("﻿"), "starts with a byte-order mark for Excel");
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], '"Name","Note"');
  assert.equal(lines[1], '"Hill, House","\'=HYPERLINK(""x"")"');
  assert.equal(lines[2], '"","42"');
});
