import assert from "node:assert/strict";
import test from "node:test";
import { coverage, dayList, isConcern, paginate, percent } from "../src/lib/log-browser";

test("dayList is inclusive, empty when backwards, and capped", () => {
  assert.deepEqual(dayList("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(dayList("2026-10-05", "2026-10-04"), []);
  assert.equal(dayList("2026-01-01", "2026-12-31", 10).length, 10);
});

test("coverage tells complete, partial, missing, upcoming and nothing owed apart", () => {
  assert.equal(coverage(0, 0), "none");
  assert.equal(coverage(0, 1), "complete");
  assert.equal(coverage(3, 3), "complete");
  assert.equal(coverage(3, 4), "complete");
  assert.equal(coverage(3, 1), "partial");
  assert.equal(coverage(3, 0), "missing");
  assert.equal(coverage(3, 1, true), "upcoming");
});

test("percent rounds and caps, and is null when nothing was expected", () => {
  assert.equal(percent(2, 3), 67);
  assert.equal(percent(5, 3), 100);
  assert.equal(percent(1, 0), null);
});

test("isConcern flags hard moods, seizures and behaviour", () => {
  assert.equal(isConcern({ mood: "good" }), false);
  assert.equal(isConcern({ mood: "low" }), true);
  assert.equal(isConcern({ mood: "great", seizure: true }), true);
  assert.equal(isConcern({ mood: "okay", behaviourOccurred: true }), true);
});

test("paginate clamps the page and reports totals", () => {
  const rows = Array.from({ length: 23 }, (_, i) => i);
  assert.deepEqual(paginate(rows, 3, 10), { rows: [20, 21, 22], page: 3, pages: 3, total: 23 });
  assert.equal(paginate(rows, 9, 10).page, 3);
  assert.deepEqual(paginate([], 1, 10), { rows: [], page: 1, pages: 1, total: 0 });
});
