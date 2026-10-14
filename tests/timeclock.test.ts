import assert from "node:assert/strict";
import { test } from "node:test";
import { clockableShift, distanceMeters, formatMinutes, handoverChecklist, handoverProblems, lateMinutes, locationVerdict, nameMatches, nextShift, overstayMinutes, workedMinutes } from "../src/lib/timeclock";

const home = { latitude: 36.1627, longitude: -86.7816 };
const at = (iso: string) => new Date(iso);

test("distance is about right over short and long hops", () => {
  assert.equal(distanceMeters(home, home), 0);
  // 0.001 degrees of latitude is about 111 meters.
  const d = distanceMeters(home, { latitude: 36.1637, longitude: -86.7816 });
  assert.ok(d > 105 && d < 117, String(d));
  // Nashville to Memphis is a bit over 300 km.
  const far = distanceMeters(home, { latitude: 35.1495, longitude: -90.049 });
  assert.ok(far > 300_000 && far < 320_000, String(far));
});

test("location verdict covers every case, and a weak fix gets its accuracy as slack", () => {
  assert.deepEqual(locationVerdict(home, null, 250), { state: "unavailable", distance: null });
  assert.deepEqual(locationVerdict({}, { ...home }, 250), { state: "home_not_set", distance: null });
  assert.deepEqual(locationVerdict(home, { ...home }, 250, false), { state: "not_checked", distance: null });
  const near = { latitude: 36.1637, longitude: -86.7816 };
  assert.equal(locationVerdict(home, near, 250).state, "ok");
  const away = { latitude: 36.1667, longitude: -86.7816 }; // about 445 m
  assert.equal(locationVerdict(home, away, 250).state, "outside");
  assert.equal(locationVerdict(home, { ...away, accuracy: 220 }, 250).state, "ok");
  // Slack never exceeds the radius again, however poor the fix.
  assert.equal(locationVerdict(home, { latitude: 36.1727, longitude: -86.7816, accuracy: 5000 }, 250).state, "outside");
});

test("the clockable shift allows the early window and prefers the closest start", () => {
  const shifts = [
    { id: "day", startsAt: at("2026-10-14T12:00:00Z"), endsAt: at("2026-10-14T20:00:00Z") },
    { id: "eve", startsAt: at("2026-10-14T20:00:00Z"), endsAt: at("2026-10-15T04:00:00Z") },
  ];
  assert.equal(clockableShift(shifts, at("2026-10-14T11:40:00Z").getTime(), 15), null);
  assert.equal(clockableShift(shifts, at("2026-10-14T11:50:00Z").getTime(), 15)?.id, "day");
  assert.equal(clockableShift(shifts, at("2026-10-14T19:50:00Z").getTime(), 15)?.id, "eve");
  assert.equal(clockableShift(shifts, at("2026-10-15T05:00:00Z").getTime(), 15), null);
  assert.equal(nextShift(shifts, at("2026-10-14T13:00:00Z").getTime())?.id, "eve");
});

test("late and overstay only count past their allowance", () => {
  const start = at("2026-10-14T12:00:00Z");
  assert.equal(lateMinutes(start, at("2026-10-14T12:05:00Z").getTime(), 7), 0);
  assert.equal(lateMinutes(start, at("2026-10-14T12:12:00Z").getTime(), 7), 12);
  assert.equal(lateMinutes(start, at("2026-10-14T11:50:00Z").getTime(), 7), 0);
  const end = at("2026-10-14T20:00:00Z");
  assert.equal(overstayMinutes(end, at("2026-10-14T20:10:00Z").getTime(), 15), 0);
  assert.equal(overstayMinutes(end, at("2026-10-14T20:40:00Z").getTime(), 15), 40);
  assert.equal(overstayMinutes(null, at("2026-10-14T23:00:00Z").getTime(), 15), 0);
});

test("worked time takes off meal breaks but not rest breaks, and counts an open break to now", () => {
  const inAt = at("2026-10-14T12:00:00Z");
  const outAt = at("2026-10-14T20:00:00Z");
  const breaks = [
    { kind: "meal" as const, startAt: at("2026-10-14T16:00:00Z"), endAt: at("2026-10-14T16:30:00Z") },
    { kind: "rest" as const, startAt: at("2026-10-14T14:00:00Z"), endAt: at("2026-10-14T14:15:00Z") },
  ];
  assert.equal(workedMinutes(inAt, outAt, breaks, 0), 450);
  const now = at("2026-10-14T16:10:00Z").getTime();
  assert.equal(workedMinutes(inAt, null, [{ kind: "meal", startAt: at("2026-10-14T16:00:00Z"), endAt: null }], now), 240);
  assert.equal(formatMinutes(450), "7 h 30 m");
  assert.equal(formatMinutes(5), "5 m");
});

test("handover checklist merges without repeats", () => {
  assert.deepEqual(handoverChecklist(["Meds counted", "Doors locked"], ["doors locked", "Van fuelled", ""]), ["Meds counted", "Doors locked", "Van fuelled"]);
});

test("handover problems: short note, unexplained ticks, unreported incident", () => {
  const rules = { minChars: 20, checklist: ["Meds counted", "Doors locked"], requireNote: true, requireChecks: true, requireIncident: true };
  const good = { note: "Quiet evening, everyone in bed by ten.", checks: [{ label: "Meds counted", done: true, comment: "" }, { label: "Doors locked", done: false, comment: "Back door lock broken, reported" }], incident: "none" as const };
  assert.deepEqual(handoverProblems(good, rules), []);
  const bad = { note: "fine", checks: [{ label: "Meds counted", done: false, comment: "" }], incident: "not_reported" as const };
  assert.equal(handoverProblems(bad, rules).length, 4);
  assert.deepEqual(handoverProblems(bad, { ...rules, requireNote: false, requireChecks: false, requireIncident: false }), []);
});

test("the signature must be the staff member's own name", () => {
  assert.equal(nameMatches(" jamal  CARTER ", "Jamal", "Carter"), true);
  assert.equal(nameMatches("J Carter", "Jamal", "Carter"), false);
  assert.equal(nameMatches("Mary-Ann O'Neil", "Mary-Ann", "O'Neil"), true);
});
