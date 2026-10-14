import "dotenv/config";
import { and, eq, gte, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { addDays, dateKey, zonedTime } from "../src/lib/format";
import { parseHolidays, periodFor, timesheet, type Punch } from "../src/lib/payroll";
import * as schema from "../src/server/db/schema";

/*
 * Adds about a month of time clock data to the demo database, without touching anything else:
 * four weeks of shifts, punches of every kind (on time, late, away, no location, stayed late, left
 * early, forgotten clock-outs, no-shows, unscheduled), breaks, handovers and reads, corrections, pay
 * periods in every state, rates, differentials, leave and time off.
 *
 * Everything added is listed in the settings row "demo_time_manifest", so
 *   pnpm tsx scripts/add-demo-time.ts --remove
 * takes it all out again. Staff entered by hand are left alone.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
const MANIFEST = "demo_time_manifest";
const DEMO_STAFF = ["Jamal", "Sofia", "Marcus", "Terrence", "Hannah", "Grace", "Luis"];
const CHECKS = ["Medications counted and locked away", "House secure: doors and windows checked", "Vehicle keys returned and fuel noted", "Petty cash counted", "Kitchen clean and food stored safely", "Fire exits clear"];
const HOME_POINTS: Record<string, [number, number]> = {
  "Hillcrest House": [36.1213, -86.8261],
  "Riverside Apartments": [36.1873, -86.7372],
  "Maple Family Home": [35.8456, -86.3903],
  "Murfreesboro Pike Day Program": [36.1102, -86.6969],
};

type Manifest = { at: string; logs: string[]; shifts: string[]; entries: string[]; corrections: string[]; periods: string[]; requests: string[]; ledger: string[]; rates: string[]; differentials: string[]; homes: string[] };

// A small seeded random so the demo comes out the same each time.
let seed = 20261014;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};
const between = (low: number, high: number) => Math.round(low + random() * (high - low));
const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
const minutes = (n: number) => n * 60_000;

async function remove() {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, MANIFEST)).limit(1);
  if (!row) return console.log("No demo time data to remove.");
  const m = row.value as Manifest;
  if (m.logs?.length) await db.delete(schema.dailyLogs).where(inArray(schema.dailyLogs.id, m.logs));
  if (m.entries.length) await db.delete(schema.handovers).where(inArray(schema.handovers.entryId, m.entries));
  if (m.ledger.length) await db.delete(schema.leaveLedger).where(inArray(schema.leaveLedger.id, m.ledger));
  if (m.requests.length) await db.delete(schema.timeOffRequests).where(inArray(schema.timeOffRequests.id, m.requests));
  if (m.periods.length) await db.delete(schema.payPeriods).where(inArray(schema.payPeriods.id, m.periods));
  if (m.corrections.length) await db.delete(schema.timeCorrections).where(inArray(schema.timeCorrections.id, m.corrections));
  if (m.entries.length) await db.delete(schema.timeEntries).where(inArray(schema.timeEntries.id, m.entries));
  if (m.shifts.length) await db.delete(schema.shifts).where(inArray(schema.shifts.id, m.shifts));
  if (m.rates.length) await db.delete(schema.payRates).where(inArray(schema.payRates.id, m.rates));
  if (m.differentials.length) await db.delete(schema.payDifferentials).where(inArray(schema.payDifferentials.id, m.differentials));
  if (m.homes.length) await db.update(schema.homes).set({ latitude: null, longitude: null }).where(inArray(schema.homes.id, m.homes));
  // Notifications the reminders sent about this data.
  await db.delete(schema.notifications).where(and(gte(schema.notifications.createdAt, new Date(m.at)), or(like(schema.notifications.kind, "time%"), like(schema.notifications.kind, "timesheet%"))));
  await db.delete(schema.settings).where(eq(schema.settings.key, MANIFEST));
  console.log(`Removed ${m.entries.length} punches, ${m.shifts.length} shifts and the rest of the demo time data.`);
}

async function add() {
  const [existing] = await db.select().from(schema.settings).where(eq(schema.settings.key, MANIFEST)).limit(1);
  if (existing) return console.log("Demo time data is already in. Run with --remove first to add it again.");
  const m: Manifest = { at: new Date().toISOString(), logs: [], shifts: [], entries: [], corrections: [], periods: [], requests: [], ledger: [], rates: [], differentials: [], homes: [] };
  const now = Date.now();
  const today = dateKey();
  const [admin] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "admin")).limit(1);
  const homes = await db.select().from(schema.homes).where(eq(schema.homes.active, true));
  const homeByName = new Map(homes.map(home => [home.name, home]));
  const staff = (await db.select().from(schema.staff).where(and(eq(schema.staff.active, true), inArray(schema.staff.firstName, DEMO_STAFF)))).filter(member => member.homeId);
  const byFirst = new Map(staff.map(member => [member.firstName, member]));
  const patterns = await db.select().from(schema.shiftPatterns).where(eq(schema.shiftPatterns.active, true));
  const pattern = (name: string) => patterns.find(item => item.name === name);
  const residents = await db.select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, homeId: schema.individuals.homeId }).from(schema.individuals).where(eq(schema.individuals.active, true));

  // Map locations for the homes, so distances can be checked.
  for (const home of homes) {
    const point = HOME_POINTS[home.name];
    if (point && home.latitude === null) {
      await db.update(schema.homes).set({ latitude: point[0], longitude: point[1] }).where(eq(schema.homes.id, home.id));
      home.latitude = point[0];
      home.longitude = point[1];
      m.homes.push(home.id);
    }
  }

  // Who works what: [first name, pattern, weekdays (1 = Mon ... 7 = Sun)].
  const rota: [string, string, number[]][] = [
    ["Jamal", "Weekday day", [1, 2, 3, 4, 5]],
    ["Sofia", "Weekday evening", [1, 2, 3, 4, 5]],
    ["Marcus", "Weekday overnight", [1, 2, 3, 4]],
    ["Marcus", "Weekend night", [6]],
    ["Terrence", "Weekday day", [1, 2, 3, 4, 5]],
    ["Hannah", "Weekday evening", [1, 2, 3, 4]],
    ["Hannah", "Weekend day", [6, 7]],
    ["Grace", "Weekday day", [1, 2, 3, 4, 5]],
    ["Luis", "Weekday day", [1, 2, 3, 4, 5]],
  ];
  const isoDay = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() || 7;
  const first = addDays(today, -31);
  const sofiaOff = ["2026-10-05", "2026-10-06"].map(day => (day < today ? day : ""));

  // Past shifts, up to yesterday. This week's shifts are already in the schedule.
  const existingShifts = await db.select({ staffId: schema.shifts.staffId, startsAt: schema.shifts.startsAt }).from(schema.shifts).where(gte(schema.shifts.startsAt, zonedTime(first, "00:00")));
  const made: { id: string; staffId: string; homeId: string; startsAt: Date; endsAt: Date; patternId: string | null; pattern: string }[] = [];
  for (let day = first; day < addDays(today, -2); day = addDays(day, 1)) {
    for (const [name, patternName, days] of rota) {
      const member = byFirst.get(name);
      const p = pattern(patternName);
      if (!member || !p || !days.includes(isoDay(day))) continue;
      if (name === "Sofia" && sofiaOff.includes(day)) continue;
      const startsAt = zonedTime(day, p.start);
      const endsAt = zonedTime(p.end <= p.start ? addDays(day, 1) : day, p.end);
      if (existingShifts.some(shift => shift.staffId === member.id && Math.abs(shift.startsAt.getTime() - startsAt.getTime()) < minutes(60))) continue;
      const kind = p.start < "12:00" ? "day" : p.start < "19:00" ? "evening" : "overnight";
      const [row] = await db.insert(schema.shifts).values({ homeId: member.homeId!, staffId: member.id, startsAt, endsAt, kind, patternId: p.id, status: "completed" }).returning({ id: schema.shifts.id });
      m.shifts.push(row.id);
      made.push({ id: row.id, staffId: member.id, homeId: member.homeId!, startsAt, endsAt, patternId: p.id, pattern: p.name });
    }
  }
  // An extra Saturday for Jamal two weeks ago, so a week runs into overtime.
  const extraDay = (() => {
    let day = addDays(today, -14);
    while (isoDay(day) !== 6) day = addDays(day, -1);
    return day;
  })();
  const jamal = byFirst.get("Jamal");
  const weekendDay = pattern("Weekend day");
  if (jamal && weekendDay) {
    const startsAt = zonedTime(extraDay, weekendDay.start);
    const endsAt = zonedTime(extraDay, weekendDay.end);
    const [row] = await db.insert(schema.shifts).values({ homeId: jamal.homeId!, staffId: jamal.id, startsAt, endsAt, kind: "day", patternId: weekendDay.id, status: "completed", note: "Covering for Hannah" }).returning({ id: schema.shifts.id });
    m.shifts.push(row.id);
    made.push({ id: row.id, staffId: jamal.id, homeId: jamal.homeId!, startsAt, endsAt, patternId: weekendDay.id, pattern: weekendDay.name });
  }

  // This week's shifts that have already started, from the schedule.
  const thisWeek = await db
    .select({ id: schema.shifts.id, staffId: schema.shifts.staffId, homeId: schema.shifts.homeId, startsAt: schema.shifts.startsAt, endsAt: schema.shifts.endsAt, patternId: schema.shifts.patternId, pattern: schema.shiftPatterns.name })
    .from(schema.shifts)
    .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
    .where(and(gte(schema.shifts.startsAt, zonedTime(addDays(today, -2), "00:00")), lt(schema.shifts.startsAt, new Date(now)), inArray(schema.shifts.staffId, staff.map(member => member.id))));
  const all = [...made, ...thisWeek.map(shift => ({ ...shift, staffId: shift.staffId!, pattern: shift.pattern ?? "Shift" }))].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  // Punches. Each shift gets a story; most are ordinary.
  const stories = [...Array<string>(34).fill("normal"), "graceLate", "graceLate", "graceLate", "late", "late", "late", "lateException", "noLocation", "away", "overstay", "leftEarly", "forgot", "noShow", "edited"];
  const lastHandover = new Map<string, { id: string; at: Date; staffId: string }>();
  let ongoing = 0;
  for (const shift of all) {
    const member = staff.find(item => item.id === shift.staffId)!;
    const home = homes.find(item => item.id === shift.homeId)!;
    const running = shift.endsAt.getTime() > now;
    const story = running ? (ongoing++ === 1 ? "late" : "normal") : pick(stories);
    if (story === "noShow") {
      if (!thisWeek.some(item => item.id === shift.id)) await db.update(schema.shifts).set({ status: "missed", note: "No call, no show" }).where(eq(schema.shifts.id, shift.id));
      continue;
    }
    const lateBy = story === "graceLate" ? between(2, 6) : story === "late" ? between(9, 24) : story === "lateException" ? between(34, 52) : 0;
    const clockInAt = new Date(shift.startsAt.getTime() + (lateBy ? minutes(lateBy) : -minutes(between(1, 12))));
    if (clockInAt.getTime() > now) continue;
    const clockOutAt: Date | null = running
      ? null
      : new Date(shift.endsAt.getTime() + (story === "overstay" ? minutes(between(35, 70)) : story === "leftEarly" ? -minutes(between(40, 75)) : minutes(between(-4, 9))));
    const flags: string[] = [];
    const recordedLate = lateBy > 7 ? lateBy : 0;
    if (lateBy >= 30) flags.push("late");
    const near = (home.latitude ?? 36.16) + (random() - 0.5) * 0.0008;
    const nearLng = (home.longitude ?? -86.78) + (random() - 0.5) * 0.0008;
    const inLocation = story === "noLocation" ? "unavailable" : story === "away" ? "outside" : "ok";
    if (inLocation === "unavailable") flags.push("no_location_in");
    if (inLocation === "outside") flags.push("away_in");
    let overstayReason = "";
    if (story === "overstay" && clockOutAt) {
      flags.push("overstay");
      overstayReason = pick(["Night staff arrived late, stayed until they came", "Tasha had a seizure at shift change; stayed to help", "Waited with Devon for the on-call nurse"]);
    }
    if (story === "leftEarly" && clockOutAt) {
      flags.push("left_early");
      overstayReason = pick(["Family emergency; manager agreed by phone", "Relieved early by the next shift", "Felt unwell; Marcus covered the last hour"]);
    }
    let closedBy: "staff" | "manager" | null = clockOutAt ? "staff" : null;
    if (story === "forgot" && clockOutAt) {
      flags.push("forgot_clock_out");
      closedBy = "manager";
    }
    const people = residents.filter(person => person.homeId === home.id);
    const warnings = clockOutAt && random() < 0.05 && people.length ? [`1 daily note not written: ${pick(people).first}`] : [];
    if (warnings.length) flags.push("left_undone");
    const old = clockInAt.getTime() < now - 7 * 86_400_000;
    const [entry] = await db
      .insert(schema.timeEntries)
      .values({
        staffId: member.id,
        homeId: home.id,
        shiftId: shift.id,
        clockInAt,
        clockOutAt,
        closedBy,
        inLatitude: inLocation === "unavailable" ? null : inLocation === "outside" ? near + 0.02 : near,
        inLongitude: inLocation === "unavailable" ? null : inLocation === "outside" ? nearLng + 0.015 : nearLng,
        inAccuracy: inLocation === "unavailable" ? null : between(8, 35),
        inDistance: inLocation === "unavailable" ? null : inLocation === "outside" ? between(1900, 2600) : between(10, 60),
        inLocation,
        outLatitude: clockOutAt && closedBy === "staff" ? near : null,
        outLongitude: clockOutAt && closedBy === "staff" ? nearLng : null,
        outAccuracy: clockOutAt && closedBy === "staff" ? between(8, 30) : null,
        outDistance: clockOutAt && closedBy === "staff" ? between(10, 60) : null,
        outLocation: clockOutAt && closedBy === "staff" ? "ok" : "not_checked",
        inNote: story === "away" ? "Picked Tasha up from her day program on the way in" : story === "noLocation" ? "Phone location was off" : "",
        lateMinutes: recordedLate,
        overstayReason,
        statements: ["I am fit for duty, rested and not impaired.", "I will follow each person's support plan and the medication record."],
        attestedName: clockOutAt && closedBy === "staff" ? `${member.firstName} ${member.lastName}` : "",
        warnings,
        flags,
        reviewedBy: flags.length && old && random() < 0.75 ? admin?.id : null,
        reviewedAt: flags.length && old ? new Date(clockOutAt?.getTime() ?? now) : null,
        userAgent: "demo-data",
      })
      .returning({ id: schema.timeEntries.id });
    m.entries.push(entry.id);

    // Breaks: a meal on most long shifts, sometimes a rest break.
    const length = ((clockOutAt?.getTime() ?? now) - clockInAt.getTime()) / 3_600_000;
    if (length >= 7 && random() < 0.65) {
      const mealStart = new Date(clockInAt.getTime() + minutes(between(210, 300)));
      if (mealStart.getTime() < now) await db.insert(schema.timeBreaks).values({ entryId: entry.id, kind: "meal", startAt: mealStart, endAt: new Date(mealStart.getTime() + minutes(30)) });
    }
    if (length >= 5 && random() < 0.3) {
      const restStart = new Date(clockInAt.getTime() + minutes(between(90, 150)));
      if (restStart.getTime() < now) await db.insert(schema.timeBreaks).values({ entryId: entry.id, kind: "rest", startAt: restStart, endAt: new Date(restStart.getTime() + minutes(15)) });
    }
    if (running && ongoing === 3) await db.insert(schema.timeBreaks).values({ entryId: entry.id, kind: "meal", startAt: new Date(now - minutes(10)), endAt: null });

    // A manager's fix for forgotten clock-outs and edited punches.
    if (story === "forgot" && clockOutAt && admin) {
      await db.insert(schema.timeEntryChanges).values({ entryId: entry.id, userId: admin.id, action: "closed", before: { clockInAt: clockInAt.toISOString(), clockOutAt: null }, after: { clockInAt: clockInAt.toISOString(), clockOutAt: clockOutAt.toISOString() }, reason: "Confirmed the leaving time with the next shift" });
    }
    if (story === "edited" && clockOutAt && admin) {
      const before = new Date(clockOutAt.getTime() + minutes(95));
      await db.insert(schema.timeEntryChanges).values({ entryId: entry.id, userId: admin.id, action: "edited", before: { clockInAt: clockInAt.toISOString(), clockOutAt: before.toISOString() }, after: { clockInAt: clockInAt.toISOString(), clockOutAt: clockOutAt.toISOString() }, reason: "Clocked out late from home; left at shift end per the handover" });
      await db.update(schema.timeEntries).set({ flags: [...flags, "edited"] }).where(eq(schema.timeEntries.id, entry.id));
    }

    // Reading the last handover at this home before clocking in.
    const previous = lastHandover.get(home.id);
    if (previous && previous.staffId !== member.id && clockInAt.getTime() - previous.at.getTime() < 24 * 3_600_000) {
      await db.insert(schema.handoverReads).values({ handoverId: previous.id, staffId: member.id, entryId: entry.id, readAt: clockInAt }).onConflictDoNothing();
    }

    // Daily notes for most people on the shift; a few are left owed.
    if (clockOutAt) {
      const kind = /night/i.test(shift.pattern) ? "overnight" : /evening/i.test(shift.pattern) ? "evening" : "day";
      for (const person of people) {
        if (random() < 0.08) continue;
        const writtenAt = new Date(clockOutAt.getTime() - minutes(between(5, 40)));
        const [log] = await db
          .insert(schema.dailyLogs)
          .values({
            individualId: person.id,
            staffId: member.id,
            logDate: dateKey(shift.startsAt),
            mood: pick(["great", "good", "good", "good", "okay", "okay", "low"] as const),
            shift: kind,
            shiftId: shift.id,
            shiftName: shift.pattern,
            location: "At home",
            checks: ["Personal care supported", "Meals and fluids offered", "Medications reviewed", "Home safety walk"],
            activities: pick(["Walk to the park and a game of cards.", "Helped cook dinner and watched a film.", "Music, puzzles and a call with family.", "Grocery run and laundry together."]),
            notes: `${person.first} ${pick(["had a calm, settled shift and ate well at every meal.", "was cheerful and joined in the activities.", "seemed tired after lunch and rested; brighter by the evening.", "needed reminders with personal care but managed most of it alone."])}`,
            signedName: `${member.firstName} ${member.lastName}`,
            signedAt: writtenAt,
            createdAt: writtenAt,
          })
          .returning({ id: schema.dailyLogs.id });
        m.logs.push(log.id);
      }
    }

    // The handover they wrote at clock-out.
    if (clockOutAt && closedBy === "staff") {
      const notes = [
        "Quiet shift. Everyone ate well and was settled by the end. Groceries are low on milk and bread.",
        "Good shift overall. Went for a walk to the park after lunch. Laundry is done and put away.",
        "Busy morning with appointments; afternoon was calm. Med cabinet restocked from the pharmacy delivery.",
        "Some upset before dinner, calmed with music and a snack. Everything else routine.",
        "Evening went smoothly. Showers done, everyone in bed on time. Back door lock sticks; reported to Marcus.",
      ];
      const missed = random() < 0.15 ? pick(CHECKS) : null;
      const [handover] = await db
        .insert(schema.handovers)
        .values({
          homeId: home.id,
          entryId: entry.id,
          staffId: member.id,
          note: pick(notes),
          people: people.slice(0, between(0, Math.min(2, people.length))).map(person => ({ individualId: person.id, name: `${person.first} ${person.last}`, note: pick(["Appointment tomorrow at 10", "Ate less than usual at dinner", "In good spirits all day", "Asked to call her sister tomorrow"]) })),
          checks: CHECKS.map(label => ({ label, done: label !== missed, comment: label === missed ? "Will finish first thing next shift" : "" })),
          incident: random() < 0.06 ? "reported" : "none",
          createdAt: clockOutAt,
        })
        .returning({ id: schema.handovers.id });
      lastHandover.set(home.id, { id: handover.id, at: clockOutAt, staffId: member.id });
    }
  }

  // Two clock-ins with no scheduled shift.
  for (const [name, daysAgo, reason] of [["Grace", 9, "Covered a sick call at Riverside"], ["Terrence", 4, "Called in to help with an outing"]] as const) {
    const member = byFirst.get(name);
    const home = homeByName.get("Riverside Apartments");
    if (!member || !home) continue;
    const day = addDays(today, -daysAgo);
    const [entry] = await db
      .insert(schema.timeEntries)
      .values({ staffId: member.id, homeId: home.id, clockInAt: zonedTime(day, "16:05"), clockOutAt: zonedTime(day, "20:10"), closedBy: "staff", inLocation: "ok", outLocation: "ok", inDistance: 22, outDistance: 18, inNote: reason, unscheduled: true, flags: ["unscheduled"], attestedName: `${member.firstName} ${member.lastName}`, userAgent: "demo-data" })
      .returning({ id: schema.timeEntries.id });
    m.entries.push(entry.id);
  }

  // Correction requests: two waiting, one approved, one declined.
  const demoEntries = await db.select().from(schema.timeEntries).where(and(inArray(schema.timeEntries.id, m.entries), sql`${schema.timeEntries.clockOutAt} is not null`));
  const pickEntry = (name: string, offset: number) => {
    const member = byFirst.get(name);
    return demoEntries.filter(entry => entry.staffId === member?.id).sort((a, b) => b.clockInAt.getTime() - a.clockInAt.getTime())[offset];
  };
  const corrections: [string, number, "pending" | "approved" | "declined", string, string][] = [
    ["Sofia", 1, "pending", "My phone died before I could clock out. I left at 11:05 pm after the overnight arrived.", ""],
    ["Terrence", 2, "pending", "I clocked in late by mistake; I was here at 6:55 am, Hannah can confirm.", ""],
    ["Hannah", 3, "approved", "Forgot to clock out; left at the end of the shift.", "Checked against the handover time."],
    ["Luis", 2, "declined", "I think I stayed until 4 pm.", "The door log shows you left at 3:05 pm."],
  ];
  for (const [name, offset, status, reason, note] of corrections) {
    const entry = pickEntry(name, offset);
    if (!entry || !entry.clockOutAt) continue;
    const [row] = await db
      .insert(schema.timeCorrections)
      .values({ staffId: entry.staffId, entryId: entry.id, homeId: entry.homeId, clockInAt: new Date(entry.clockInAt.getTime() - minutes(10)), clockOutAt: new Date(entry.clockOutAt.getTime() + minutes(20)), reason, status, decidedBy: status === "pending" ? null : admin?.id, decidedAt: status === "pending" ? null : new Date(), decisionNote: note })
      .returning({ id: schema.timeCorrections.id });
    m.corrections.push(row.id);
  }

  // Pay rates and differentials.
  const rates: Record<string, number> = { Jamal: 1650, Sofia: 1700, Marcus: 2200, Terrence: 1575, Hannah: 1625, Grace: 1600, Luis: 1550 };
  for (const member of staff) {
    const [row] = await db.insert(schema.payRates).values({ staffId: member.id, centsPerHour: rates[member.firstName] ?? 1600, effectiveFrom: "2026-01-01", note: "Starting rate", createdBy: admin?.id }).returning({ id: schema.payRates.id });
    m.rates.push(row.id);
  }
  if (jamal) {
    const [row] = await db.insert(schema.payRates).values({ staffId: jamal.id, centsPerHour: 1725, effectiveFrom: "2026-10-01", note: "Raise after annual review", createdBy: admin?.id }).returning({ id: schema.payRates.id });
    m.rates.push(row.id);
  }
  const riverside = homeByName.get("Riverside Apartments");
  for (const values of [
    { name: "Overnight", kind: "hours" as const, startTime: "23:00", endTime: "07:00", days: [], homeId: null, centsPerHour: 100 },
    { name: "Weekend", kind: "days" as const, startTime: "", endTime: "", days: [6, 7], homeId: null, centsPerHour: 75 },
    ...(riverside ? [{ name: "Riverside Apartments", kind: "home" as const, startTime: "", endTime: "", days: [], homeId: riverside.id, centsPerHour: 50 }] : []),
  ]) {
    const [row] = await db.insert(schema.payDifferentials).values(values).returning({ id: schema.payDifferentials.id });
    m.differentials.push(row.id);
  }

  // Pay periods: the older one locked and exported, the last one waiting, and this one running.
  await db.delete(schema.payPeriods).where(and(eq(schema.payPeriods.status, "open"), sql`not exists (select 1 from timesheets t where t.period_id = ${schema.payPeriods.id})`, sql`not exists (select 1 from time_adjustments a where a.period_id = ${schema.payPeriods.id})`));
  const current = periodFor(today, "biweekly", "2026-01-05");
  const last = periodFor(addDays(current.start, -1), "biweekly", "2026-01-05");
  const older = periodFor(addDays(last.start, -1), "biweekly", "2026-01-05");
  const rules = { rounding: 0, overtimeAfterHours: 40, weekStartsOn: 7, holidays: parseHolidays([]), payFromShiftStart: true };
  const punchesFor = async (staffId: string, period: { start: string; end: string }) => {
    const rows = await db
      .select({ id: schema.timeEntries.id, clockInAt: schema.timeEntries.clockInAt, clockOutAt: schema.timeEntries.clockOutAt, homeId: schema.timeEntries.homeId, shiftStart: schema.shifts.startsAt })
      .from(schema.timeEntries)
      .leftJoin(schema.shifts, eq(schema.shifts.id, schema.timeEntries.shiftId))
      .where(and(eq(schema.timeEntries.staffId, staffId), gte(schema.timeEntries.clockInAt, zonedTime(addDays(period.start, -7), "00:00")), lt(schema.timeEntries.clockInAt, zonedTime(addDays(period.end, 8), "00:00"))));
    const meals = rows.length ? await db.select().from(schema.timeBreaks).where(and(inArray(schema.timeBreaks.entryId, rows.map(row => row.id)), eq(schema.timeBreaks.kind, "meal"))) : [];
    return rows.map((row): Punch => ({ ...row, home: null, mealMinutes: meals.filter(meal => meal.entryId === row.id && meal.endAt).reduce((sum, meal) => sum + Math.round((meal.endAt!.getTime() - meal.startAt.getTime()) / 60_000), 0) }));
  };
  const snapshot = (totals: ReturnType<typeof timesheet>["totals"]) => ({ regular: totals.regular, overtime: totals.overtime, total: totals.total, holiday: totals.holiday, adjustments: totals.adjustments, punches: totals.punches });

  const lockedAt = zonedTime(addDays(older.end, 2), "10:00");
  const [olderRow] = await db.insert(schema.payPeriods).values({ startDate: older.start, endDate: older.end, status: "locked", lockedBy: admin?.id, lockedAt, exportedAt: new Date(lockedAt.getTime() + minutes(20)) }).onConflictDoNothing().returning();
  const [lastRow] = await db.insert(schema.payPeriods).values({ startDate: last.start, endDate: last.end }).onConflictDoNothing().returning();
  const [currentRow] = await db.insert(schema.payPeriods).values({ startDate: current.start, endDate: current.end }).onConflictDoNothing().returning();
  for (const row of [olderRow, lastRow, currentRow]) if (row) m.periods.push(row.id);

  for (const member of staff) {
    const name = `${member.firstName} ${member.lastName}`;
    if (olderRow) {
      const sheet = timesheet(await punchesFor(member.id, older), older, rules);
      if (sheet.totals.punches) {
        await db.insert(schema.timesheets).values({ periodId: olderRow.id, staffId: member.id, status: "approved", signedName: name, signedAt: zonedTime(addDays(older.end, 1), "09:15"), signedTotals: snapshot(sheet.totals), approvedBy: admin?.id, approvedAt: zonedTime(addDays(older.end, 2), "09:30"), approvedTotals: snapshot(sheet.totals) });
        const earned = Math.floor(sheet.totals.total / 30);
        if (earned) {
          const [entry] = await db.insert(schema.leaveLedger).values({ staffId: member.id, kind: "accrual", minutes: earned, onDate: older.end, note: `Earned ${older.start} to ${older.end}`, periodId: olderRow.id, createdBy: admin?.id }).returning({ id: schema.leaveLedger.id });
          m.ledger.push(entry.id);
        }
      }
    }
    if (lastRow) {
      const sheet = timesheet(await punchesFor(member.id, last), last, rules);
      const state = { Jamal: "approved", Sofia: "signed", Terrence: "returned", Hannah: "open", Grace: "signed", Luis: "unsigned-approved", Marcus: "open" }[member.firstName] ?? "open";
      if (state === "approved") await db.insert(schema.timesheets).values({ periodId: lastRow.id, staffId: member.id, status: "approved", signedName: name, signedAt: zonedTime(addDays(last.end, 1), "08:40"), signedTotals: snapshot(sheet.totals), approvedBy: admin?.id, approvedAt: zonedTime(addDays(last.end, 2), "10:00"), approvedTotals: snapshot(sheet.totals) });
      if (state === "signed") await db.insert(schema.timesheets).values({ periodId: lastRow.id, staffId: member.id, status: "signed", signedName: name, signedAt: zonedTime(addDays(last.end, 1), "19:20"), signedTotals: snapshot(sheet.totals) });
      if (state === "returned") await db.insert(schema.timesheets).values({ periodId: lastRow.id, staffId: member.id, status: "open", returnNote: "Thursday shows no meal break. Did you take one? Ask for a correction if so." });
      if (state === "unsigned-approved") await db.insert(schema.timesheets).values({ periodId: lastRow.id, staffId: member.id, status: "approved", approvedBy: admin?.id, approvedAt: zonedTime(addDays(last.end, 2), "11:00"), approvalNote: "On leave this week; hours checked against the schedule", approvedTotals: snapshot(sheet.totals) });
      if (member.firstName === "Marcus") await db.insert(schema.timeAdjustments).values({ periodId: lastRow.id, staffId: member.id, minutes: 120, relatesTo: addDays(last.start, 3), reason: "Medication administration refresher, paid training off the clock", createdBy: admin?.id });
    }
  }

  // Leave: opening balances, then time off in every state.
  for (const member of staff) {
    const [entry] = await db.insert(schema.leaveLedger).values({ staffId: member.id, kind: "adjustment", minutes: between(16, 40) * 60, onDate: "2026-09-01", note: "Opening balance", createdBy: admin?.id }).returning({ id: schema.leaveLedger.id });
    m.ledger.push(entry.id);
  }
  const requests: [string, string, string, string, number, "pending" | "approved" | "declined" | "cancelled", string, string][] = [
    ["Sofia", "Vacation / PTO", "2026-10-05", "2026-10-06", 16, "approved", "Family wedding in Memphis", "Enjoy the wedding"],
    ["Luis", "Vacation / PTO", addDays(today, 8), addDays(today, 8), 8, "approved", "Moving apartments", ""],
    ["Hannah", "Vacation / PTO", addDays(today, 16), addDays(today, 17), 16, "pending", "Long weekend away", ""],
    ["Terrence", "Sick", addDays(today, 1), addDays(today, 1), 8, "pending", "Doctor's appointment and recovery", ""],
    ["Grace", "Unpaid leave", addDays(today, 5), addDays(today, 7), 24, "declined", "Trip home", "We are short that week; could you move it a week later?"],
    ["Jamal", "Vacation / PTO", addDays(today, 20), addDays(today, 20), 8, "cancelled", "Concert", ""],
  ];
  for (const [name, type, startDate, endDate, hoursOff, status, reason, note] of requests) {
    const member = byFirst.get(name);
    if (!member) continue;
    const paid = type !== "Unpaid leave";
    const usesBalance = type === "Vacation / PTO" || type === "Sick";
    const [row] = await db
      .insert(schema.timeOffRequests)
      .values({ staffId: member.id, type, paid, usesBalance, startDate, endDate, minutes: hoursOff * 60, reason, status, decidedBy: ["approved", "declined"].includes(status) ? admin?.id : null, decidedAt: ["approved", "declined"].includes(status) ? new Date(now - 3 * 86_400_000) : null, decisionNote: note, createdAt: new Date(Math.min(now, zonedTime(startDate, "09:00").getTime()) - (status === "pending" && type === "Sick" ? 2 : 20) * 86_400_000) })
      .returning({ id: schema.timeOffRequests.id });
    m.requests.push(row.id);
    if (status === "approved" && usesBalance) {
      const [entry] = await db.insert(schema.leaveLedger).values({ staffId: member.id, kind: "used", minutes: -hoursOff * 60, onDate: startDate, note: type, requestId: row.id, createdBy: admin?.id }).returning({ id: schema.leaveLedger.id });
      m.ledger.push(entry.id);
    }
  }

  await db.insert(schema.settings).values({ key: MANIFEST, value: m, updatedAt: new Date() });
  console.log(`Added ${m.shifts.length} shifts, ${m.entries.length} punches, ${m.logs.length} daily notes, ${m.corrections.length} corrections, ${m.periods.length} pay periods, ${m.requests.length} time off requests, ${m.rates.length} pay rates and ${m.differentials.length} differentials.`);
  const open = await db.select({ id: schema.timeEntries.id }).from(schema.timeEntries).where(and(inArray(schema.timeEntries.id, m.entries), isNull(schema.timeEntries.clockOutAt)));
  console.log(`${open.length} people are on the clock right now.`);
}

(process.argv.includes("--remove") ? remove() : add())
  .then(() => pool.end())
  .catch(async error => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
