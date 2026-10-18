import assert from "node:assert/strict";
import { test } from "node:test";
import { selectionItems } from "../mobile/src/lib/selection";
import { websiteAdminLinks } from "../mobile/src/lib/website-admin";
test("a fifty-home picker searches words without losing the stable home identity", () => {
  const homes = Array.from({ length: 50 }, (_, index) => [`id-${index}`, `Harbor House ${index + 1}`] as const);
  assert.equal(selectionItems(homes).length, 50);
  assert.deepEqual(selectionItems(homes, " HOUSE 27 harbor "), [{ id: "id-26", label: "Harbor House 27" }]);
  assert.deepEqual(selectionItems(homes, "missing"), []);
  assert.deepEqual(selectionItems(["Day", "Night"], "night"), [{ id: "Night", label: "Night" }]);
});
test("website administration shortcuts respect manager roles and administrator-only office setup", () => {
  assert.deepEqual(websiteAdminLinks("dsp"), []); assert.deepEqual(websiteAdminLinks("nurse"), []);
  assert.ok(websiteAdminLinks("admin").some(link => link.path === "/app/settings#office"));
  assert.ok(!websiteAdminLinks("coordinator").some(link => link.path === "/app/settings#office"));
  assert.ok(websiteAdminLinks("coordinator").some(link => link.path === "/app/homes/new"));
  assert.ok(websiteAdminLinks("admin").every(link => link.path.startsWith("/app")));
});
