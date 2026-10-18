import assert from "node:assert/strict";
import { test } from "node:test";
import { officeAccess, officeAccessChangeError, officeLocationError, officePoint, type OfficePolicy } from "../src/lib/office-work";
const policy: OfficePolicy = { office_work_enabled: "on", office_work_staff: ["approved"], office_work_address: "TEST Office", office_work_latitude: "36.1", office_work_longitude: "-86.7", office_work_radius: 100 };
test("office access can be granted only by another administrator", () => {
  assert.ok(officeAccessChangeError("coordinator", "manager", [], ["staff"]));
  assert.ok(officeAccessChangeError("admin", "manager", [], ["manager"]));
  assert.equal(officeAccessChangeError("admin", "manager", [], ["staff"]), null);
  assert.equal(officeAccessChangeError("admin", "manager", ["manager"], ["manager"]), null);
});
test("office work requires configuration, explicit staff access and no due care shift", () => {
  assert.equal(officeAccess(policy, "approved", true, false), null);
  for (const [staff, active, due] of [["not-approved", true, false], ["approved", false, false], ["approved", true, true]] as const) assert.ok(officeAccess(policy, staff, active, due));
  assert.ok(officeAccess({ ...policy, office_work_enabled: "off" }, "approved", true, false));
  assert.ok(officeAccess({ ...policy, office_work_address: "" }, "approved", true, false));
  assert.equal(officePoint({ ...policy, office_work_latitude: "" }), null);
});
test("office starts require accurate GPS inside the radius; accuracy cannot extend it", () => {
  assert.equal(officeLocationError(policy, { latitude: 36.1, longitude: -86.7, accuracy: 10 }), null);
  assert.ok(officeLocationError(policy, null));
  assert.ok(officeLocationError(policy, { latitude: 36.1, longitude: -86.7 }));
  assert.ok(officeLocationError(policy, { latitude: 36.1, longitude: -86.7, accuracy: 101 }));
  assert.ok(officeLocationError(policy, { latitude: 36.1012, longitude: -86.7, accuracy: 100 }));
});
