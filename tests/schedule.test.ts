import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeWeek, checkAssignment, compactRange, rankCandidates, requiredKinds, scheduleCsv, windowFor, type SchedShift, type SchedStaff, type ScheduleRules } from "../src/lib/schedule";

const rules: ScheduleRules = { coverageMinimum: 1, overtimeHours: 40, minRestHours: 8, times: { day: "07:00-15:00", evening: "15:00-23:00", overnight: "23:00-07:00" } };
const week = { from: "2026-10-12", to: "2026-10-19" };
const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
const person = (id: string, extra: Partial<SchedStaff> = {}): SchedStaff => ({ id, firstName: id, lastName: "Test", role: "dsp", homeId: "h1", expiredCredentials: [], ...extra });
let next = 0;
const shift = (day: string, kind: "day" | "evening" | "overnight", staffId: string | null, extra: Partial<SchedShift> = {}): SchedShift => ({
  id: `s${next++}`,
  homeId: "h1",
  staffId,
  kind,
  status: staffId ? "scheduled" : "open",
  note: "",
  ...windowFor(day, rules.times[kind]),
  ...extra,
});

test("overnight windows end the next morning in Central time", () => {
  const night = windowFor("2026-10-12", "23:00-07:00");
  assert.equal(night.startsAt, "2026-10-13T04:00:00.000Z");
  assert.equal(night.endsAt, "2026-10-13T12:00:00.000Z");
});

test("double-booking blocks an assignment, and back-to-back shifts only warn about rest", () => {
  const evening = shift("2026-10-12", "evening", "ana");
  const overlapping = { id: "x", ...windowFor("2026-10-12", "20:00-23:30") };
  assert.match(checkAssignment(overlapping, person("ana"), [evening], rules, week).blocked!, /Already working/);
  const overnight = shift("2026-10-12", "overnight", null);
  const check = checkAssignment(overnight, person("ana"), [evening], rules, week);
  assert.equal(check.blocked, null, "an overnight right after an evening does not overlap");
  assert.match(check.warnings.join(), /0h rest/);
});

test("overtime and expired credentials are warnings, and ranking prefers people without them", () => {
  const busy = days.slice(0, 5).map(day => shift(day, "day", "ben"));
  const target = shift("2026-10-17", "day", null);
  const check = checkAssignment(target, person("ben"), busy, rules, week);
  assert.equal(check.hoursAfter, 48);
  assert.match(check.warnings.join(), /over 40/);
  const ranked = rankCandidates(target, [person("ben"), person("cy", { expiredCredentials: ["CPR"] }), person("dee", { homeId: "h2" }), person("eve")], busy, rules, week);
  assert.deepEqual(ranked.map(c => c.person.id), ["eve", "dee", "cy", "ben"]);
});

test("the week analysis finds gaps, double-booking, short rest and overtime", () => {
  const shifts = [
    shift("2026-10-14", "day", "ana"),
    shift("2026-10-14", "day", "ana", { homeId: "h2" }),
    shift("2026-10-14", "evening", null),
    shift("2026-10-14", "overnight", "bo"),
    shift("2026-10-15", "day", "bo"),
  ];
  const result = analyzeWeek(shifts, [person("ana"), person("bo")], [{ id: "h1", name: "Hill", type: "group_home", staffedKinds: ["day", "evening", "overnight"], openDays: [1, 2, 3, 4, 5, 6, 7] }], days, rules, "2026-10-14");
  const types = result.issues.map(issue => issue.type);
  assert.ok(types.includes("double"));
  assert.ok(types.includes("rest"), "overnight then day shift leaves no rest");
  assert.ok(types.includes("coverage"));
  assert.equal(result.coverage.get("h1|2026-10-14|evening")?.filled, 0);
  assert.ok(!result.issues.some(issue => issue.day && issue.day < "2026-10-14" && issue.type === "coverage"), "past days are not reported as gaps");
  assert.equal(result.issues[0].severity, "high");
});

test("the spreadsheet export quotes cells and defuses formulas", () => {
  const csv = scheduleCsv([shift("2026-10-14", "day", "ana", { note: '=HYPERLINK("x"), "late"' })], [{ id: "h1", name: "Hill, House", type: "group_home", staffedKinds: [], openDays: [] }], [person("ana")]);
  const line = csv.split("\r\n")[1];
  assert.match(line, /"Hill, House"/);
  assert.match(line, /"'=HYPERLINK\(""x""\), ""late"""/);
});

test("a home only needs the shifts and days set on it", () => {
  const program = { id: "p", name: "Program", type: "day_program", staffedKinds: ["day" as const], openDays: [1, 2, 3, 4, 5] };
  assert.deepEqual(requiredKinds(program, "2026-10-16"), ["day"]); // Friday
  assert.deepEqual(requiredKinds(program, "2026-10-17"), []); // Saturday
  const result = analyzeWeek([], [], [program], days, rules, "2026-10-12");
  assert.equal(result.issues.filter(issue => issue.type === "coverage").length, 5, "weekday day shifts only");
});

test("an expired credential is one warning per person, flagging each of their shifts", () => {
  const shifts = [shift("2026-10-14", "day", "jo"), shift("2026-10-15", "day", "jo"), shift("2026-10-16", "day", "jo")];
  const result = analyzeWeek(shifts, [person("jo", { expiredCredentials: ["CPR"] })], [], days, rules, "2026-10-14");
  const warnings = result.issues.filter(issue => issue.type === "credential");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].text, /3 upcoming shifts/);
  assert.equal(result.credentialRisk.size, 3);
});

test("card times are short", () => {
  assert.equal(compactRange(windowFor("2026-10-14", "07:00-15:00")), "7a–3p");
  assert.equal(compactRange(windowFor("2026-10-14", "07:30-23:00")), "7:30a–11p");
  assert.equal(compactRange(windowFor("2026-10-14", "23:00-07:00")), "11p–7a");
});
