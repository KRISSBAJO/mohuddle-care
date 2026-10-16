import "server-only";
import { and, asc, eq, gte, inArray, lt, or } from "drizzle-orm";
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
  | { adminId: string; ok: false; code: "already_recorded" | "not_due" | "not_found" | "controlled_offline"; error: string };

// A dose saved on a phone with no signal is accepted for this long afterwards.
const OFFLINE_MAX_MS = 24 * 3_600_000;

export async function recordDose(user: SessionUser, input: DoseInput, options: { offline?: boolean } = {}): Promise<DoseResult> {
  const now = Date.now();
  const [dose] = await db
    .select({ id: schema.medAdministrations.id, status: schema.medAdministrations.status, scheduledFor: schema.medAdministrations.scheduledFor, recordedAt: schema.medAdministrations.recordedAt, controlled: schema.medications.controlled, staffFirst: schema.staff.firstName, staffLast: schema.staff.lastName })
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

  // A phone's time is trusted only within limits: not in the future, and not more than a day back.
  const said = input.at ? Date.parse(input.at) : now;
  const at = new Date(Number.isFinite(said) && said <= now && now - said <= OFFLINE_MAX_MS ? said : now);
  if (input.status === "given" && dose.scheduledFor.getTime() > at.getTime()) return { adminId: input.adminId, ok: false, code: "not_due", error: "This dose is not due yet." };

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
  if (!home) return { home: null, homes, people: [], doses: [], lateMinutes: settings.med_late_minutes };

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
    doses: doses.map(({ staffFirst, staffLast, ...dose }) => ({ ...dose, by: staffFirst ? `${staffFirst} ${staffLast}` : null })),
    lateMinutes: settings.med_late_minutes,
  };
}
