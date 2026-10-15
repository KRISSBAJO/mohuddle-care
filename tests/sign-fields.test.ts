import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanFields, initialsOnEveryPage, pdfBox } from "../src/lib/sign-fields";

test("fields are checked and kept on the page", () => {
  const result = cleanFields(
    [
      { id: "sig", kind: "signature", page: 2, x: 0.9, y: 0.95, w: 0.3, h: 0.07 },
      { id: "ini", kind: "initials", page: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.04 },
    ],
    2,
  );
  assert.ok("fields" in result);
  assert.deepEqual(result.fields.map(field => field.id), ["ini", "sig"]);
  assert.equal(result.fields[1].x, 0.7);
  assert.equal(result.fields[1].y, 0.93);
});

test("bad fields are refused with a plain reason", () => {
  assert.deepEqual(cleanFields([{ kind: "stamp", page: 1, x: 0, y: 0, w: 0.1, h: 0.1 }], 1), { error: "Unknown field type." });
  assert.deepEqual(cleanFields([{ kind: "signature", page: 3, x: 0, y: 0, w: 0.1, h: 0.1 }], 2), { error: "A field is on a page the document does not have." });
  assert.match((cleanFields([{ kind: "initials", page: 1, x: 0, y: 0, w: 0.1, h: 0.1 }], 1) as { error: string }).error, /at least one signature/);
  assert.deepEqual(cleanFields([], 3), { fields: [] });
});

test("positions convert to PDF points from the bottom left", () => {
  assert.deepEqual(pdfBox({ id: "a", kind: "date", page: 1, x: 0.5, y: 0.25, w: 0.25, h: 0.25 }, 600, 800), { x: 300, y: 400, width: 150, height: 200 });
});

test("initial every page adds one per page that has none", () => {
  const start = [{ id: "keep", kind: "initials" as const, page: 2, x: 0.1, y: 0.1, w: 0.1, h: 0.04 }];
  const all = initialsOnEveryPage(3, start);
  assert.equal(all.length, 3);
  assert.deepEqual(all.filter(field => field.kind === "initials").map(field => field.page).sort(), [1, 2, 3]);
});
