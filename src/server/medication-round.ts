import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { addDays, dateKey, fmt, zonedTime } from "@/lib/format";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { ensureMedicationRecords } from "@/server/queries/hub";
import { clockInContext, openEntry } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

/*
 * Recording doses, shared by the website's medication record and the phone app. A dose can be
 * recorded once: the second attempt (two staff, or a phone sending a dose saved with no signal) is
 * refused, and told who recorded it.
 */

export const DOSE_STATUSES = ["given", "refused", "missed", "held"] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

export const doseInput = z.object({
  adminId: z.uuid(),
  status: z.enum(DOSE_STATUSES),
  note: z.string().trim().max(500).default(""),
  // When it happened, from a phone that saved it with no signal. Never later than now.
  at: z.iso.datetime().optional(),
});
export type DoseInput = z.infer<typeof doseInput>;

export type DoseResult =
  | { adminId: string; ok: true }
  | { adminId: string; ok: false; code: "already_recorded" | "not_due" | "not_found" | "controlled_offline" | "not_at_home"; error: string };

// A dose saved on a phone with no signal is accepted for this long afterwards.
const OFFLINE_MAX_MS = 24 * 3_600_000;

// Around a dose, how far a clock-in or a shift may be and still count as working at the home.
const AT_HOME_SLACK_MS = 60 * 60_000;

/*
 * Whether this person may record a dose for someone at this moment. With the agency's
 * med_record_scope at its default, direct support staff record only at a home where they were
 * clocked in, or had a shift, around the time of the dose; nurses and managers record anywhere.
 * Checking the time of the dose, not now, lets a dose saved with no signal be sent after clock-out.
 */
async function mayRecordFor(user: SessionUser, individualId: string, at: Date): Promise<string | null> {
  if (user.role !== "dsp" || (await getSettings()).med_record_scope === "anyone") return null;
  if (!user.staffId) return "Your login is not linked to a staff record, so you cannot record medicines.";
  const [person] = await db.select({ homeId: schema.individuals.homeId }).from(schema.individuals).where(eq(schema.individuals.id, individualId)).limit(1);
  if (!person?.homeId) return "This person has no home on record. Ask a nurse or manager to record it.";
  const latestStart = new Date(at.getTime() + AT_HOME_SLACK_MS);
  const earliestEnd = new Date(at.getTime() - AT_HOME_SLACK_MS);
  const [clocked] = await db
    .select({ id: schema.timeEntries.id })
    .from(schema.timeEntries)
    .where(and(eq(schema.timeEntries.staffId, user.staffId), eq(schema.timeEntries.homeId, person.homeId), lte(schema.timeEntries.clockInAt, latestStart), or(isNull(schema.timeEntries.clockOutAt), gte(schema.timeEntries.clockOutAt, earliestEnd))))
    .limit(1);
  if (clocked) return null;
  const [shift] = await db
    .select({ id: schema.shifts.id })
    .from(schema.shifts)
    .where(and(eq(schema.shifts.staffId, user.staffId), eq(schema.shifts.homeId, person.homeId), ne(schema.shifts.status, "missed"), lte(schema.shifts.startsAt, latestStart), gte(schema.shifts.endsAt, earliestEnd)))
    .limit(1);
  return shift ? null : "You can record medicines only at the home you are working at. Clock in there first.";
}

export async function recordDose(user: SessionUser, input: DoseInput, options: { offline?: boolean } = {}): Promise<DoseResult> {
  const now = Date.now();
  const [dose] = await db
    .select({ id: schema.medAdministrations.id, individualId: schema.medAdministrations.individualId, status: schema.medAdministrations.status, scheduledFor: schema.medAdministrations.scheduledFor, recordedAt: schema.medAdministrations.recordedAt, controlled: schema.medications.controlled, staffFirst: schema.staff.firstName, staffLast: schema.staff.lastName })
    .from(schema.medAdministrations)
    .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.medAdministrations.staffId))
    .where(eq(schema.medAdministrations.id, input.adminId))
    .limit(1);
  if (!dose) return { adminId: input.adminId, ok: false, code: "not_found", error: "This dose is no longer on the medication record." };
  // Controlled medicines are only recorded live, so the latest record is always seen first.
  if (options.offline && dose.controlled) return { adminId: input.adminId, ok: false, code: "controlled_offline", error: "Controlled medicines can only be recorded with a signal." };
  const already = () => {
    const by = dose.staffFirst ? `${dose.staffFirst} ${dose.staffLast}` : "someone";
    return { adminId: input.adminId, ok: false as const, code: "already_recorded" as const, error: `Already recorded as ${dose.status} by ${by}${dose.recordedAt ? ` at ${fmt.time(dose.recordedAt)}` : ""}.` };
  };
  if (dose.status !== "due") return already();

  // A phone's time is used only for a dose saved with no signal, and only within limits: not in the
  // future, and not more than a day back. A dose recorded live is always timed by the server.
  const said = options.offline && input.at ? Date.parse(input.at) : now;
  const at = new Date(Number.isFinite(said) && said <= now && now - said <= OFFLINE_MAX_MS ? said : now);
  if (input.status === "given" && dose.scheduledFor.getTime() > at.getTime()) return { adminId: input.adminId, ok: false, code: "not_due", error: "This dose is not due yet." };
  const refused = await mayRecordFor(user, dose.individualId, at);
  if (refused) return { adminId: input.adminId, ok: false, code: "not_at_home", error: refused };

  const updated = await db.transaction(async tx => {
    const rows = await tx
      .update(schema.medAdministrations)
      .set({ status: input.status, recordedAt: at, staffId: user.staffId, note: input.note })
      .where(and(eq(schema.medAdministrations.id, input.adminId), eq(schema.medAdministrations.status, "due")))
      .returning({ id: schema.medAdministrations.id });
    if (rows.length) await tx.insert(schema.auditLog).values({ userId: user.id, action: `med:${input.status}${options.offline ? ":offline" : ""}`, entity: "med_administration", entityId: input.adminId });
    return rows.length > 0;
  });
  // Someone else recorded it between the read and the write.
  if (!updated) {
    const [fresh] = await db.select({ status: schema.medAdministrations.status }).from(schema.medAdministrations).where(eq(schema.medAdministrations.id, input.adminId)).limit(1);
    dose.status = fresh?.status ?? dose.status;
    return already();
  }
  return { adminId: input.adminId, ok: true };
}

/*
 * The phone app's medicine round: today's doses for the people at the home the staff member is at
 * (clocked in there, or on shift there), or at a home they chose.
 */
export async function homeRound(user: SessionUser, chosenHome: string | null, now: number) {
  const settings = await getSettings();
  let homeId = chosenHome;
  if (!homeId && user.staffId) {
    const open = await openEntry(user.staffId);
    homeId = open?.entry.homeId ?? (await clockInContext(user.staffId, now, settings)).shift?.homeId ?? null;
  }
  const homes = await db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.active, true)).orderBy(asc(schema.homes.name));
  const home = homes.find(item => item.id === homeId) ?? null;
  if (!home) return { home: null, homes, people: [], doses: [], prn: [], lateMinutes: settings.med_late_minutes, effectMinutes: settings.prn_effect_minutes };

  const today = dateKey(new Date(now));
  await ensureMedicationRecords(today);
  const people = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, allergies: schema.individuals.allergies })
    .from(schema.individuals)
    .where(and(eq(schema.individuals.homeId, home.id), eq(schema.individuals.active, true)))
    .orderBy(asc(schema.individuals.firstName));
  const ids = people.map(person => person.id);
  const doses = ids.length
    ? await db
        .select({
          id: schema.medAdministrations.id,
          individualId: schema.medAdministrations.individualId,
          scheduledFor: schema.medAdministrations.scheduledFor,
          status: schema.medAdministrations.status,
          recordedAt: schema.medAdministrations.recordedAt,
          note: schema.medAdministrations.note,
          medication: schema.medications.name,
          dose: schema.medications.dose,
          route: schema.medications.route,
          instructions: schema.medications.instructions,
          controlled: schema.medications.controlled,
          prn: schema.medAdministrations.prn,
          staffFirst: schema.staff.firstName,
          staffLast: schema.staff.lastName,
        })
        .from(schema.medAdministrations)
        .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
        .leftJoin(schema.staff, eq(schema.staff.id, schema.medAdministrations.staffId))
        .where(
          and(
            inArray(schema.medAdministrations.individualId, ids),
            lt(schema.medAdministrations.scheduledFor, zonedTime(addDays(today, 1), "00:00")),
            // Today's doses, and any still not recorded from the day before, so a late dose does not vanish at midnight.
            or(gte(schema.medAdministrations.scheduledFor, zonedTime(today, "00:00")), and(eq(schema.medAdministrations.status, "due"), gte(schema.medAdministrations.scheduledFor, new Date(now - 24 * 3_600_000)))),
          ),
        )
        .orderBy(asc(schema.medAdministrations.scheduledFor))
    : [];
  return {
    home,
    homes,
    people: people.map(person => ({ id: person.id, name: `${person.first} ${person.last}`, allergies: person.allergies })),
    // As-needed doses are listed with their medicine (prn), not in the round.
    doses: doses.filter(dose => !dose.prn).map(({ staffFirst, staffLast, ...dose }) => ({ ...dose, by: staffFirst ? `${staffFirst} ${staffLast}` : null })),
    prn: await prnFor(ids, now),
    lateMinutes: settings.med_late_minutes,
    effectMinutes: settings.prn_effect_minutes,
  };
}

/* ---------- As needed (PRN) ---------- */

/*
 * The as-needed medicines of these people, with when each was last given and when the next dose is
 * allowed, so staff see the limits before they give one.
 */
export async function prnFor(individualIds: string[], now: number) {
  if (!individualIds.length) return [];
  const meds = await db
    .select({ id: schema.medications.id, individualId: schema.medications.individualId, name: schema.medications.name, dose: schema.medications.dose, route: schema.medications.route, instructions: schema.medications.instructions, controlled: schema.medications.controlled, prnUse: schema.medications.prnUse, prnMinHours: schema.medications.prnMinHours, prnMaxPerDay: schema.medications.prnMaxPerDay })
    .from(schema.medications)
    .where(and(inArray(schema.medications.individualId, individualIds), eq(schema.medications.active, true), eq(schema.medications.asNeeded, true)))
    .orderBy(asc(schema.medications.name));
  if (!meds.length) return [];
  const given = await db
    .select({ id: schema.medAdministrations.id, medicationId: schema.medAdministrations.medicationId, at: schema.medAdministrations.scheduledFor, reason: schema.medAdministrations.note, effect: schema.medAdministrations.effect, effectAt: schema.medAdministrations.effectAt, staffId: schema.medAdministrations.staffId, staffFirst: schema.staff.firstName, staffLast: schema.staff.lastName })
    .from(schema.medAdministrations)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.medAdministrations.staffId))
    .where(and(inArray(schema.medAdministrations.medicationId, meds.map(med => med.id)), eq(schema.medAdministrations.prn, true), eq(schema.medAdministrations.status, "given"), gte(schema.medAdministrations.scheduledFor, new Date(now - 48 * 3_600_000))))
    .orderBy(asc(schema.medAdministrations.scheduledFor));
  return meds.map(med => {
    const doses = given.filter(dose => dose.medicationId === med.id);
    const last = doses.at(-1) ?? null;
    const inDay = doses.filter(dose => dose.at.getTime() > now - 24 * 3_600_000);
    // The next dose is allowed after the gap since the last one, and once the oldest of a full day's doses is 24 hours old.
    const byGap = last && med.prnMinHours ? last.at.getTime() + med.prnMinHours * 3_600_000 : 0;
    const byMax = med.prnMaxPerDay && inDay.length >= med.prnMaxPerDay ? inDay[inDay.length - med.prnMaxPerDay].at.getTime() + 24 * 3_600_000 : 0;
    const nextAllowed = Math.max(byGap, byMax);
    return {
      ...med,
      givenToday: inDay.length,
      nextAllowedAt: nextAllowed > now ? new Date(nextAllowed) : null,
      recent: inDay.map(dose => ({ id: dose.id, at: dose.at, reason: dose.reason, effect: dose.effect, effectAt: dose.effectAt, staffId: dose.staffId, by: dose.staffFirst ? `${dose.staffFirst} ${dose.staffLast}` : null })),
    };
  });
}

export const prnInput = z.object({ medicationId: z.uuid(), reason: z.string().trim().min(3, "Say why it is being given.").max(500) });

/*
 * Gives an as-needed dose now, after checking the gap since the last dose and the most in 24 hours.
 * The medicine row is locked while checking, so two staff cannot both give it at the same moment.
 */
export async function givePrn(user: SessionUser, input: z.infer<typeof prnInput>): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const [forPerson] = await db.select({ individualId: schema.medications.individualId }).from(schema.medications).where(eq(schema.medications.id, input.medicationId)).limit(1);
  if (forPerson) {
    const refused = await mayRecordFor(user, forPerson.individualId, new Date());
    if (refused) return { ok: false, error: refused };
  }
  return db.transaction(async tx => {
    const [med] = await tx.select().from(schema.medications).where(eq(schema.medications.id, input.medicationId)).for("update");
    if (!med || !med.active || !med.asNeeded) return { ok: false as const, error: "This is not an as-needed medicine any more. Refresh." };
    const now = Date.now();
    const doses = await tx
      .select({ at: schema.medAdministrations.scheduledFor, staffFirst: schema.staff.firstName, staffLast: schema.staff.lastName })
      .from(schema.medAdministrations)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.medAdministrations.staffId))
      .where(and(eq(schema.medAdministrations.medicationId, med.id), eq(schema.medAdministrations.prn, true), eq(schema.medAdministrations.status, "given"), gte(schema.medAdministrations.scheduledFor, new Date(now - 24 * 3_600_000))))
      .orderBy(asc(schema.medAdministrations.scheduledFor));
    const last = doses.at(-1);
    if (last && med.prnMinHours && now - last.at.getTime() < med.prnMinHours * 3_600_000) {
      const by = last.staffFirst ? ` by ${last.staffFirst} ${last.staffLast}` : "";
      return { ok: false as const, error: `Last given at ${fmt.time(last.at)}${by}. Doses must be at least ${med.prnMinHours} hours apart, so the next one can be given from ${fmt.time(new Date(last.at.getTime() + med.prnMinHours * 3_600_000))}.` };
    }
    if (med.prnMaxPerDay && doses.length >= med.prnMaxPerDay) return { ok: false as const, error: `Already given ${doses.length} times in the last 24 hours, the most allowed. Ask the nurse or manager.` };
    const at = new Date(now);
    const [row] = await tx
      .insert(schema.medAdministrations)
      .values({ medicationId: med.id, individualId: med.individualId, scheduledFor: at, recordedAt: at, status: "given", staffId: user.staffId, note: input.reason, prn: true })
      .returning({ id: schema.medAdministrations.id });
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "med:prn", entity: "med_administration", entityId: row.id });
    return { ok: true as const, adminId: row.id };
  });
}

export const effectInput = z.object({ adminId: z.uuid(), effect: z.string().trim().min(3, "Say how it worked.").max(500) });

/* How an as-needed dose worked, recorded afterwards. Once only. */
export async function recordEffect(user: SessionUser, input: z.infer<typeof effectInput>): Promise<{ ok: true } | { ok: false; error: string }> {
  const [given] = await db.select({ individualId: schema.medAdministrations.individualId }).from(schema.medAdministrations).where(eq(schema.medAdministrations.id, input.adminId)).limit(1);
  if (given) {
    const refused = await mayRecordFor(user, given.individualId, new Date());
    if (refused) return { ok: false, error: refused };
  }
  const rows = await db
    .update(schema.medAdministrations)
    .set({ effect: input.effect, effectAt: new Date() })
    .where(and(eq(schema.medAdministrations.id, input.adminId), eq(schema.medAdministrations.prn, true), eq(schema.medAdministrations.status, "given"), eq(schema.medAdministrations.effect, "")))
    .returning({ id: schema.medAdministrations.id });
  if (!rows.length) return { ok: false, error: "The effect of this dose is already recorded, or the dose is not on record." };
  await db.insert(schema.auditLog).values({ userId: user.id, action: "med:prn_effect", entity: "med_administration", entityId: input.adminId });
  return { ok: true };
}
