/*
 * Development seed. Creates a realistic week at Milestone so every screen has something to show.
 * Safe to run again: it wipes and rebuilds the demo data. Never run against production.
 */
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/server/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database");
const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@milestonecare.net").toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Milestone-demo-2026";

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });

const TZ = "America/Chicago";
function dateKey(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function zoned(day: string, hhmm: string) {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asUtc - guess));
}
function weekStart(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

async function main() {
  const today = dateKey();
  const monday = weekStart(today);

  await db.execute(sql`truncate table audit_log, login_tokens, sessions, users, enquiries, tasks, incidents, med_administrations, medications, daily_logs, shifts, plan_goals, individuals, credentials, staff, homes, settings restart identity cascade`);

  const [hillcrest, maple, riverside, dayProgram] = await db
    .insert(schema.homes)
    .values([
      { name: "Hillcrest House", type: "group_home", address: "4120 Hillcrest Drive", city: "Nashville", capacity: 4, phone: "615-555-0141" },
      { name: "Maple Family Home", type: "family_model", address: "88 Maple Court", city: "Murfreesboro", capacity: 2, phone: "615-555-0162", staffedKinds: [] },
      { name: "Riverside Apartments", type: "supported_living", address: "2200 Riverside Way, Apt 4B and 4C", city: "Nashville", capacity: 3, phone: "", staffedKinds: [] },
      { name: "Murfreesboro Pike Day Program", type: "day_program", address: "2131 Murfreesboro Pike, Suite 202A", city: "Nashville", capacity: 12, phone: "615-964-7088", staffedKinds: ["day"], openDays: [1, 2, 3, 4, 5] },
    ])
    .returning();

  const staffRows = await db
    .insert(schema.staff)
    .values([
      { firstName: "Angela", lastName: "Reyes", role: "coordinator", email: "angela.reyes@milestonecare.net", phone: "615-555-0101", hiredAt: "2019-03-11" },
      { firstName: "Marcus", lastName: "Bell", role: "residential_manager", email: "marcus.bell@milestonecare.net", phone: "615-555-0102", homeId: hillcrest.id, hiredAt: "2020-08-03" },
      { firstName: "Priya", lastName: "Natarajan", role: "nurse", email: "priya.n@milestonecare.net", phone: "615-555-0103", hiredAt: "2021-01-18" },
      { firstName: "Jamal", lastName: "Carter", role: "dsp", email: "jamal.carter@milestonecare.net", phone: "615-555-0104", homeId: hillcrest.id, hiredAt: "2022-05-02" },
      { firstName: "Sofia", lastName: "Hernandez", role: "dsp", email: "sofia.h@milestonecare.net", phone: "615-555-0105", homeId: hillcrest.id, hiredAt: "2023-02-13" },
      { firstName: "Terrence", lastName: "Okafor", role: "dsp", email: "terrence.o@milestonecare.net", phone: "615-555-0106", homeId: riverside.id, hiredAt: "2023-09-25" },
      { firstName: "Hannah", lastName: "Whitfield", role: "dsp", email: "hannah.w@milestonecare.net", phone: "615-555-0107", homeId: riverside.id, hiredAt: "2024-04-08" },
      { firstName: "Luis", lastName: "Moreno", role: "dsp", email: "luis.moreno@milestonecare.net", phone: "615-555-0108", homeId: dayProgram.id, hiredAt: "2024-10-14" },
      { firstName: "Grace", lastName: "Adeyemi", role: "dsp", email: "grace.a@milestonecare.net", phone: "615-555-0109", homeId: maple.id, hiredAt: "2025-06-02" },
    ])
    .returning();
  const [angela, marcus, priya, jamal, sofia, terrence, hannah, luis, grace] = staffRows;

  const adminHash = await hash(adminPassword, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const [adminUser, jamalUser] = await db
    .insert(schema.users)
    .values([
      { email: adminEmail, name: "Angela Reyes", role: "admin", passwordHash: adminHash, staffId: angela.id },
      { email: "jamal.carter@milestonecare.net", name: "Jamal Carter", role: "dsp", passwordHash: adminHash, staffId: jamal.id },
      { email: "priya.n@milestonecare.net", name: "Priya Natarajan", role: "nurse", passwordHash: adminHash, staffId: priya.id },
    ])
    .returning();

  // Each home's manager and monthly budget.
  for (const [home, manager, cents] of [
    [hillcrest, marcus, 240_000],
    [maple, grace, 90_000],
    [dayProgram, luis, 120_000],
    [riverside, hannah, 60_000],
  ] as const) {
    await db.update(schema.homes).set({ managerStaffId: manager.id, monthlyBudgetCents: cents }).where(sql`id = ${home.id}`);
  }

  const expSoon = addDays(today, 12);
  const expLater = addDays(today, 140);
  const expired = addDays(today, -9);
  await db.insert(schema.credentials).values([
    { staffId: angela.id, type: "CPR and First Aid", issuedAt: addDays(today, -600), expiresAt: expLater },
    { staffId: marcus.id, type: "CPR and First Aid", issuedAt: addDays(today, -700), expiresAt: expSoon },
    { staffId: marcus.id, type: "Medication Administration", issuedAt: addDays(today, -300), expiresAt: addDays(today, 65) },
    { staffId: priya.id, type: "Driver Licence", expiresAt: addDays(today, 400) },
    { staffId: jamal.id, type: "CPR and First Aid", issuedAt: addDays(today, -740), expiresAt: expired },
    { staffId: jamal.id, type: "DIDD Core Training", issuedAt: addDays(today, -500) },
    { staffId: sofia.id, type: "CPR and First Aid", expiresAt: addDays(today, 200) },
    { staffId: sofia.id, type: "Background Check", issuedAt: addDays(today, -200) },
    { staffId: terrence.id, type: "Medication Administration", expiresAt: addDays(today, 27) },
    { staffId: hannah.id, type: "CPR and First Aid", expiresAt: addDays(today, 310) },
    { staffId: luis.id, type: "Driver Licence", expiresAt: addDays(today, 90) },
    { staffId: grace.id, type: "DIDD Core Training", issuedAt: addDays(today, -60) },
  ]);

  const people = await db
    .insert(schema.individuals)
    .values([
      { firstName: "Devon", lastName: "Mitchell", dob: "1994-06-14", homeId: hillcrest.id, serviceType: "residential_rehabilitation", admittedAt: "2021-04-01", guardianName: "Loretta Mitchell (mother)", guardianPhone: "615-555-0201", emergencyContact: "Loretta Mitchell", emergencyPhone: "615-555-0201", allergies: "Penicillin", diagnoses: "Down syndrome, hypothyroidism", supportNotes: "Devon loves basketball and the Predators. Give choices rather than instructions. He gets anxious when plans change without warning, so tell him the night before. Signs of a hard day: pacing and rubbing his hands. A walk outside helps." },
      { firstName: "Tasha", lastName: "Greene", dob: "1988-11-02", homeId: hillcrest.id, serviceType: "residential_rehabilitation", admittedAt: "2019-09-15", guardianName: "Self (conservator: Robert Greene, brother)", guardianPhone: "615-555-0202", emergencyContact: "Robert Greene", emergencyPhone: "615-555-0202", allergies: "", diagnoses: "Intellectual disability (moderate), epilepsy", supportNotes: "Tasha communicates clearly and likes to be asked, not told. Seizure plan is on the fridge: time it, keep her safe, call Priya if over 5 minutes. She is saving for a trip to see her brother in Memphis." },
      { firstName: "Marcus", lastName: "Lee", dob: "2001-02-23", homeId: hillcrest.id, serviceType: "residential_rehabilitation", admittedAt: "2023-01-09", guardianName: "Denise Lee (mother)", guardianPhone: "615-555-0203", emergencyContact: "Denise Lee", emergencyPhone: "615-555-0203", allergies: "Tree nuts", diagnoses: "Autism, ADHD", supportNotes: "Marcus uses a visual schedule and checks it often. Headphones in the car. Swimming on Wednesdays is the highlight of his week. He does not like being touched on the shoulders." },
      { firstName: "Brianna", lastName: "Coleman", dob: "1979-08-30", homeId: hillcrest.id, serviceType: "residential_rehabilitation", admittedAt: "2017-06-20", guardianName: "Public conservator", guardianPhone: "615-555-0204", emergencyContact: "Office on call", emergencyPhone: "615-964-7088", allergies: "", diagnoses: "Cerebral palsy, intellectual disability", supportNotes: "Brianna uses a power chair and transfers with one person and a gait belt. She enjoys church on Sunday and gospel music any day. Check skin at bedtime." },
      { firstName: "Kevin", lastName: "Nguyen", dob: "2009-05-17", homeId: maple.id, serviceType: "family_model", admittedAt: "2024-08-12", guardianName: "DCS caseworker: Monica Hale", guardianPhone: "615-555-0205", emergencyContact: "Grace Adeyemi (host parent)", emergencyPhone: "615-555-0109", allergies: "", diagnoses: "Fetal alcohol spectrum disorder", supportNotes: "Kevin is 17 and in 11th grade at Blackman High. Homework at the kitchen table after a snack. He wants to learn to drive; the plan is a permit by spring." },
      { firstName: "Aisha", lastName: "Robinson", dob: "1996-12-05", homeId: riverside.id, serviceType: "supported_living", admittedAt: "2022-03-28", guardianName: "Self", guardianPhone: "", emergencyContact: "Carla Robinson (sister)", emergencyPhone: "615-555-0206", allergies: "", diagnoses: "Intellectual disability (mild), anxiety", supportNotes: "Aisha lives in 4B and works at Kroger on Nolensville Pike three afternoons a week. Support is for budgeting, cooking on Sundays and rides to appointments. Text before you knock." },
      { firstName: "Samuel", lastName: "Okoro", dob: "1990-03-19", homeId: riverside.id, serviceType: "semi_independent", admittedAt: "2020-11-02", guardianName: "Self", guardianPhone: "", emergencyContact: "Chidi Okoro (father)", emergencyPhone: "615-555-0207", allergies: "", diagnoses: "Traumatic brain injury", supportNotes: "Samuel is in 4C. Weekly check-in on bills and medication refills. He forgets appointments, so put everything on the paper calendar by his door and text a reminder the morning of." },
      { firstName: "Olivia", lastName: "Patterson", dob: "1985-07-07", homeId: null, serviceType: "day_services", admittedAt: "2018-02-05", guardianName: "Dana Patterson (mother)", guardianPhone: "615-555-0208", emergencyContact: "Dana Patterson", emergencyPhone: "615-555-0208", allergies: "Latex", diagnoses: "Intellectual disability (moderate)", supportNotes: "Olivia lives with her mother and comes to the day program Monday to Thursday. She runs the coffee cart and takes it seriously. Likes art, dislikes loud rooms." },
    ])
    .returning();
  const [devon, tasha, marcusLee, brianna, kevin, aisha, samuel, olivia] = people;

  await db.insert(schema.planGoals).values([
    { individualId: devon.id, title: "Ride the bus to day program with a travel buddy", description: "Route 55, three times a week, with Jamal fading support by December.", targetDate: addDays(today, 70) },
    { individualId: devon.id, title: "Go to one Predators game", status: "met", targetDate: addDays(today, -40) },
    { individualId: tasha.id, title: "Save $400 for the Memphis trip", description: "$25 a week from her wages. Balance in the budgeting folder.", targetDate: addDays(today, 120) },
    { individualId: marcusLee.id, title: "Order his own meal at a restaurant", description: "Practise with a picture menu first, then the real one.", targetDate: addDays(today, 45) },
    { individualId: brianna.id, title: "Join the church choir", targetDate: addDays(today, 30) },
    { individualId: kevin.id, title: "Pass the learner's permit test", description: "Study app 20 minutes a night. Practice test on Saturdays.", targetDate: addDays(today, 150) },
    { individualId: aisha.id, title: "Cook three dinners a week without support", targetDate: addDays(today, 60) },
    { individualId: samuel.id, title: "Keep every appointment for a month", targetDate: addDays(today, 30) },
    { individualId: olivia.id, title: "Run the coffee cart with one staff prompt or fewer", targetDate: addDays(today, 90) },
  ]);

  const meds = await db
    .insert(schema.medications)
    .values([
      { individualId: devon.id, name: "Levothyroxine", dose: "75 mcg", route: "oral", times: ["07:00"], prescriber: "Dr. Patel", instructions: "Empty stomach, 30 minutes before breakfast" },
      { individualId: tasha.id, name: "Lamotrigine", dose: "150 mg", route: "oral", times: ["08:00", "20:00"], prescriber: "Dr. Ferris", instructions: "" },
      { individualId: marcusLee.id, name: "Methylphenidate ER", dose: "36 mg", route: "oral", times: ["08:00"], prescriber: "Dr. Shah", instructions: "With breakfast" },
      { individualId: marcusLee.id, name: "Melatonin", dose: "3 mg", route: "oral", times: ["20:30"], prescriber: "Dr. Shah", instructions: "" },
      { individualId: brianna.id, name: "Baclofen", dose: "10 mg", route: "oral", times: ["08:00", "14:00", "20:00"], prescriber: "Dr. Owens", instructions: "" },
      { individualId: brianna.id, name: "Docusate", dose: "100 mg", route: "oral", times: ["20:00"], prescriber: "Dr. Owens", instructions: "" },
      { individualId: aisha.id, name: "Sertraline", dose: "50 mg", route: "oral", times: ["08:00"], prescriber: "Dr. Lund", instructions: "Self-administers; staff check the blister pack Sunday" },
    ])
    .returning();

  // Shifts for this week: day, evening and overnight at the group home, supported living visits, and the day program.
  const shiftRows: (typeof schema.shifts.$inferInsert)[] = [];
  const rota = [jamal, sofia, marcus, hannah, terrence];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const past = day < today;
    shiftRows.push(
      { homeId: hillcrest.id, staffId: rota[i % 2].id, kind: "day", startsAt: zoned(day, "07:00"), endsAt: zoned(day, "15:00"), status: past ? "completed" : "scheduled" },
      { homeId: hillcrest.id, staffId: i === 4 ? null : rota[(i + 1) % 2].id, kind: "evening", startsAt: zoned(day, "15:00"), endsAt: zoned(day, "23:00"), status: i === 4 ? "open" : past ? "completed" : "scheduled" },
      { homeId: hillcrest.id, staffId: i === 6 ? null : marcus.id, kind: "overnight", startsAt: zoned(day, "23:00"), endsAt: zoned(addDays(day, 1), "07:00"), status: i === 6 ? "open" : past ? "completed" : "scheduled" },
    );
    if (i < 5) {
      shiftRows.push({ homeId: dayProgram.id, staffId: luis.id, kind: "day", startsAt: zoned(day, "07:00"), endsAt: zoned(day, "15:00"), status: past ? "completed" : "confirmed" });
      shiftRows.push({ homeId: riverside.id, staffId: i % 2 ? hannah.id : terrence.id, kind: "evening", startsAt: zoned(day, "15:00"), endsAt: zoned(day, "23:00"), status: past ? "completed" : "scheduled" });
    }
  }
  await db.insert(schema.shifts).values(shiftRows);

  // Daily logs for the last four days, and a couple for today so the Today page shows both states.
  const logRows: (typeof schema.dailyLogs.$inferInsert)[] = [];
  const checks = ["Personal care supported", "Meals and fluids offered", "Medications reviewed", "Home safety walk", "Goal activity offered"];
  const narratives: Record<string, string[]> = {
    [devon.id]: ["Day program, then shot hoops at the park with Jamal.", "Practised the bus route; needed one reminder at the transfer.", "Quiet evening, watched the Predators win.", "Helped cook tacos, chose the music."],
    [tasha.id]: ["Work shift at Goodwill went well. Added $25 to savings.", "Library trip, picked two mysteries.", "No seizure activity. Called her brother.", "Movie night, her pick."],
    [marcusLee.id]: ["Swimming. Stayed in the pool the full hour.", "Practised ordering with the picture menu at home.", "Headphones forgotten; car ride was hard. Brought spares now.", "Built a Lego set, very focused."],
    [brianna.id]: ["Choir rehearsal visit; she sang along from the back.", "Skin check clear. Gospel hour on the porch.", "PT exercises done with Sofia.", "Church livestream, then a nap."],
    [kevin.id]: ["Homework done. 20 minutes on the permit app.", "Practice test score 72, up from 65.", "Basketball practice after school.", "Grocery run with Grace; picked dinner."],
    [aisha.id]: ["Cooked stir fry independently. Budget reviewed.", "Kroger shift. Texted about a rota change, handled it herself.", "Ride to therapy, went well.", "Sunday cooking: chilli for the week."],
    [samuel.id]: ["Weekly check-in. Bills paid. Dentist booked for next week.", "Reminder text sent, he made the appointment.", "Short visit, refill picked up.", "Calendar updated together."],
    [olivia.id]: ["Ran the coffee cart with no prompts.", "Art session; painted the river.", "Loud fire drill upset her, recovered in the quiet room.", "Coffee cart, one prompt for the change."],
  };
  const moods = ["great", "good", "good", "okay"] as const;
  people.forEach((person, personIndex) => {
    for (let d = 4; d >= 1; d--) {
      const day = addDays(today, -d);
      const staffFor = [jamal, sofia, hannah, terrence, grace, luis][(personIndex + d) % 6];
      logRows.push({
        individualId: person.id,
        staffId: staffFor.id,
        logDate: day,
        mood: moods[(personIndex + d) % moods.length],
        checks,
        meals: "Ate well. Fluids offered through the day.",
        activities: narratives[person.id][(d - 1) % 4],
        health: d === 2 && person.id === marcusLee.id ? "Headache after the car ride. Rested, fine by dinner." : "",
        behaviours: d === 2 && person.id === marcusLee.id ? "Upset in the car without headphones. Pulled over, waited, recovered in ten minutes." : "",
        goalProgress: d === 1 ? "Worked on the current goal; see activities." : "",
        notes: "",
        shift: "day",
        timeIn: "07:00",
        timeOut: "15:00",
        location: "At home",
        mealIntake: { Breakfast: "All", Lunch: "Most" },
        fluidsOz: 48,
        signedName: `${staffFor.firstName} ${staffFor.lastName}`,
        signedAt: zoned(day, "15:05"),
      });
    }
  });
  logRows.push(
    { individualId: devon.id, staffId: jamal.id, logDate: today, mood: "great", checks, meals: "Breakfast and lunch eaten.", activities: "Bus practice to day program. No reminders needed at the transfer today.", goalProgress: "Bus route: independent for the first time.", health: "", behaviours: "", notes: "" },
    { individualId: olivia.id, staffId: luis.id, logDate: today, mood: "good", checks, meals: "Lunch from home.", activities: "Coffee cart morning, art after lunch.", goalProgress: "", health: "", behaviours: "", notes: "" },
  );
  await db.insert(schema.dailyLogs).values(logRows);

  // Medication records: yesterday fully given, today's morning doses mostly given, one left due so the Today page has something to chase.
  const adminRows: (typeof schema.medAdministrations.$inferInsert)[] = [];
  const nowMs = Date.now();
  for (const med of meds) {
    for (const time of med.times) {
      const yesterday = zoned(addDays(today, -1), time);
      adminRows.push({ medicationId: med.id, individualId: med.individualId, scheduledFor: yesterday, recordedAt: new Date(yesterday.getTime() + 5 * 60_000), status: "given", staffId: jamal.id });
      const scheduled = zoned(today, time);
      const isPast = scheduled.getTime() < nowMs;
      const leaveDue = med.name === "Lamotrigine" && time === "08:00";
      adminRows.push({
        medicationId: med.id,
        individualId: med.individualId,
        scheduledFor: scheduled,
        recordedAt: isPast && !leaveDue ? new Date(scheduled.getTime() + 7 * 60_000) : null,
        status: isPast && !leaveDue ? "given" : "due",
        staffId: isPast && !leaveDue ? sofia.id : null,
      });
    }
  }
  await db.insert(schema.medAdministrations).values(adminRows).onConflictDoNothing();

  await db.insert(schema.incidents).values([
    { individualId: marcusLee.id, homeId: hillcrest.id, reportedBy: sofia.id, occurredAt: zoned(addDays(today, -2), "16:20"), category: "behavioural", severity: "moderate", description: "On the drive home from swimming Marcus became distressed when he realised his headphones were not in the car. He hit the window twice with an open hand. Sofia pulled into the Walgreens lot, turned the radio off and waited. He calmed within ten minutes and asked to go home. No injury.", actionsTaken: "Spare headphones now kept in the glove box. Support notes updated. Mother informed by phone at 6pm.", reportable: false, status: "under_review" },
    { individualId: brianna.id, homeId: hillcrest.id, reportedBy: jamal.id, occurredAt: zoned(addDays(today, -1), "21:05"), category: "injury", severity: "low", description: "During the evening transfer Brianna's left forearm brushed the chair arm and left a 3 cm red mark. No broken skin.", actionsTaken: "Cold pack applied. Nurse notified. Skin check at bedtime recorded. Conservator informed by email.", reportable: false, status: "open" },
    { individualId: tasha.id, homeId: hillcrest.id, reportedBy: marcus.id, occurredAt: zoned(addDays(today, -6), "02:40"), category: "medication_error", severity: "high", description: "Overnight staff found that Tasha's 8pm Lamotrigine had been signed as given but the blister pack still held the dose.", actionsTaken: "Nurse on call consulted; dose not doubled. Seizure watch overnight, none observed. Reportable incident filed with DIDD. Medication administration refresher scheduled for evening staff.", reportable: true, stateFiledAt: zoned(addDays(today, -6), "09:15"), stateReference: "DIDD-2026-0418", status: "closed", closedAt: zoned(addDays(today, -3), "11:00") },
  ]);

  await db.insert(schema.tasks).values([
    { title: "Renew Jamal's CPR certification", details: "Expired. Book the next Red Cross class.", assignedTo: angela.id, dueAt: zoned(today, "17:00"), priority: "high" },
    { title: "Fill Friday evening shift at Hillcrest", assignedTo: angela.id, homeId: hillcrest.id, dueAt: zoned(addDays(today, 1), "12:00"), priority: "high" },
    { title: "Book Samuel's dentist follow-up", assignedTo: terrence.id, individualId: samuel.id, dueAt: zoned(today, "15:00"), priority: "normal" },
    { title: "Order picture menu cards for Marcus", assignedTo: sofia.id, individualId: marcusLee.id, dueAt: zoned(addDays(today, 3), "12:00"), priority: "normal" },
    { title: "Quarterly fire drill at Hillcrest", assignedTo: marcus.id, homeId: hillcrest.id, dueAt: zoned(addDays(today, 9), "10:00"), priority: "low" },
    { title: "Send choir director Brianna's schedule", assignedTo: jamal.id, individualId: brianna.id, priority: "low", status: "done", completedAt: zoned(addDays(today, -1), "14:30") },
  ]);

  await db.insert(schema.enquiries).values([
    { kind: "contact", name: "Renee Walker", email: "renee.walker@example.com", phone: "615-555-0301", interest: "Supported Living", message: "My son is 24 and ready to move out of our home with support. Can we talk about supported living in Antioch?" },
    { kind: "careers", name: "Dominique Price", email: "d.price@example.com", phone: "615-555-0302", interest: "Direct Support Professional", message: "Three years at a group home in Clarksville. Available evenings and weekends." },
    { kind: "contact", name: "Case manager, TennCare ECF CHOICES", email: "referrals@example.org", phone: "", interest: "Day Services", message: "Referral for a 31-year-old man in Smyrna. Please send intake paperwork.", handled: true },
  ]);

  await db.insert(schema.homeExpenses).values([
    { homeId: hillcrest.id, spentOn: addDays(today, -12), category: "Groceries", amountCents: 18_640, vendor: "Kroger, Nolensville Pike", description: "Weekly groceries", paymentMethod: "company_card", submittedBy: jamalUser.id, status: "approved", reviewedBy: adminUser.id, reviewedAt: new Date() },
    { homeId: hillcrest.id, spentOn: addDays(today, -5), category: "Groceries", amountCents: 17_215, vendor: "Kroger, Nolensville Pike", description: "Weekly groceries", paymentMethod: "company_card", submittedBy: jamalUser.id, status: "approved", reviewedBy: adminUser.id, reviewedAt: new Date() },
    { homeId: hillcrest.id, spentOn: addDays(today, -9), category: "Household supplies", amountCents: 4_320, vendor: "Walmart", description: "Cleaning supplies and paper towels", paymentMethod: "petty_cash", submittedBy: jamalUser.id, status: "approved" },
    { homeId: hillcrest.id, spentOn: addDays(today, -1), category: "Repairs and maintenance", amountCents: 28_500, vendor: "Music City Plumbing", description: "Kitchen tap replaced", paymentMethod: "invoice", submittedBy: jamalUser.id, status: "pending" },
    { homeId: maple.id, spentOn: addDays(today, -8), category: "Groceries", amountCents: 9_120, vendor: "Publix", description: "Groceries for Kevin", paymentMethod: "staff_paid", submittedBy: adminUser.id, status: "approved" },
    { homeId: dayProgram.id, spentOn: addDays(today, -6), category: "Activities and outings", amountCents: 7_850, vendor: "Michaels", description: "Art supplies for the program", paymentMethod: "company_card", submittedBy: adminUser.id, status: "approved" },
  ]);

  await db.insert(schema.homeIssues).values([
    { homeId: hillcrest.id, title: "Smoke detector chirping in hallway", details: "Low battery chirp started last night. Battery is a 9V.", category: "Safety", priority: "urgent", reportedBy: jamalUser.id, assignedTo: marcus.id, dueOn: today },
    { homeId: hillcrest.id, title: "Kitchen tap leaking", details: "Drips constantly from the base.", category: "Repairs", priority: "high", status: "in_progress", reportedBy: jamalUser.id, assignedTo: marcus.id, dueOn: addDays(today, 2), resolution: "Plumber came, part on order." },
    { homeId: hillcrest.id, title: "Van tyre pressure light on", details: "Came on during the drive back from swimming.", category: "Vehicle", priority: "normal", reportedBy: adminUser.id, assignedTo: marcus.id, dueOn: addDays(today, -2) },
    { homeId: riverside.id, title: "Wi-Fi drops in apartment 4C", details: "Samuel says it cuts out most evenings.", category: "Phones and IT", priority: "low", reportedBy: adminUser.id, assignedTo: hannah.id },
    { homeId: maple.id, title: "Back door lock sticks", details: "Hard to open from outside.", category: "Repairs", priority: "normal", status: "resolved", reportedBy: adminUser.id, assignedTo: grace.id, resolution: "Locksmith adjusted the strike plate.", resolvedAt: new Date() },
  ]);

  await db.insert(schema.settings).values([
    { key: "credential_warning_days", value: 30 },
    { key: "daily_log_due_hour", value: 22 },
    { key: "med_late_minutes", value: 60 },
    { key: "incident_report_hours", value: 24 },
    { key: "shift_coverage_minimum", value: 1 },
    { key: "required_daily_checks", value: checks },
    { key: "expense_approval_dollars", value: 100 },
    { key: "credential_types", value: ["CPR and First Aid", "DIDD Core Training", "Background Check", "Medication Administration", "Driver Licence"] },
  ]);

  console.log(`Seeded ${people.length} people, ${staffRows.length} staff, ${shiftRows.length} shifts, ${logRows.length} logs. Sign in as ${adminEmail}.`);
  await pool.end();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
