import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateKey } from "@/lib/format";
import { canManage } from "@/server/auth";
import { db, schema } from "@/server/db";
import { bookAppointment, closeAppointment, documentAppointment, updateAppointment } from "@/server/appointment-workflow";
import { saveContact } from "@/server/care-team-workflow";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { noteFields } from "@/server/mobile/note-input";
import { appointmentFormData } from "@/server/queries/appointment-form";
import { appointmentDetail, listAppointments } from "@/server/queries/appointments";
import { addWeightRecord, setWeightPlan } from "@/server/weight-workflow";
export const dynamic = "force-dynamic";
export const GET = phoneRoute(async (user, request) => {
  const params = new URL(request.url).searchParams, mode = params.get("mode") ?? "people", id = params.get("id") ?? "";
  if (mode === "people") {
    const q = (params.get("q") ?? "").trim().slice(0, 100), page = Math.min(1000, Math.max(0, Number(params.get("page")) || 0));
    const rows = await db.select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, home: schema.homes.name }).from(schema.individuals).leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId)).where(and(eq(schema.individuals.active, true), q ? ilike(sql`${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}`, `%${q}%`) : undefined)).orderBy(asc(schema.individuals.firstName), asc(schema.individuals.id)).limit(51).offset(Math.floor(page) * 50);
    return reply({ people: rows.slice(0, 50).map(person => ({ id: person.id, name: `${person.first} ${person.last}`, home: person.home })), hasMore: rows.length > 50, page: Math.floor(page) });
  }
  if (mode === "appointments") {
    const view = z.enum(["upcoming", "document", "followup", "past"]).safeParse(params.get("view") ?? "upcoming");
    if (!view.success) return problem(400, "invalid", "Unknown appointment view.");
    const personId = params.get("person") ?? undefined;
    if (personId && !z.uuid().safeParse(personId).success) return problem(400, "invalid", "Unknown person.");
    return reply({ rows: await listAppointments({ view: view.data, personId, q: (params.get("q") ?? "").slice(0, 100), limit: 100 }) });
  }
  if (mode === "booking") return reply({ ...await appointmentFormData(), today: dateKey() });
  if (!z.uuid().safeParse(id).success) return problem(404, "not_found", "Unknown record.");
  if (mode === "appointment") {
    const result = await appointmentDetail(id);
    if (!result) return problem(404, "not_found", "This appointment is not on record.");
    const appointment = result.appointment;
    return reply({ ...result, canChange: appointment.status === "scheduled" && (canManage(user) || user.role === "nurse" || appointment.createdBy === user.id), canDocument: appointment.status === "scheduled" && appointment.scheduledAt.getTime() <= Date.now() + 3_600_000 });
  }
  if (mode === "health") {
    const [person] = await db.select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, weightLow: schema.individuals.weightLow, weightHigh: schema.individuals.weightHigh, heightInches: schema.individuals.heightInches }).from(schema.individuals).where(eq(schema.individuals.id, id)).limit(1);
    if (!person) return problem(404, "not_found", "This person is not on record.");
    const [weights, contacts, history, insurance] = await Promise.all([
      db.select().from(schema.weightRecords).where(eq(schema.weightRecords.individualId, id)).orderBy(desc(schema.weightRecords.recordedOn), desc(schema.weightRecords.createdAt)).limit(100),
      db.select().from(schema.personContacts).where(eq(schema.personContacts.individualId, id)).orderBy(asc(schema.personContacts.role)),
      db.select({ day: schema.dailyLogs.logDate, vitals: schema.dailyLogs.vitals, health: schema.dailyLogs.health, signedName: schema.dailyLogs.signedName }).from(schema.dailyLogs).where(eq(schema.dailyLogs.individualId, id)).orderBy(desc(schema.dailyLogs.logDate)).limit(30),
      db.select().from(schema.personInsurance).where(eq(schema.personInsurance.individualId, id)).orderBy(asc(schema.personInsurance.rank)),
    ]);
    return reply({ person: { ...person, name: `${person.first} ${person.last}` }, weights, contacts, history, insurance, canEdit: canManage(user) || user.role === "nurse", today: dateKey() });
  }
  return problem(400, "invalid", "Unknown care view.");
});
export const POST = phoneRoute(async (user, request) => {
  const raw = await request.json().catch(() => null);
  const parsed = z.object({ action: z.enum(["book", "update", "cancelled", "missed", "document", "weight", "plan", "contact"]), id: z.uuid().optional(), contactId: z.uuid().optional() }).safeParse(raw);
  const form = noteFields(raw);
  if (!parsed.success || !form) return problem(400, "invalid", "The care request could not be read.");
  const { action, id, contactId } = parsed.data;
  if (action !== "book" && !id) return problem(400, "invalid", "Choose a record.");
  // Every supplied parent must be visible in this agency before creating a child record.
  if (["weight", "plan", "contact"].includes(action)) {
    const [person] = await db.select({ id: schema.individuals.id }).from(schema.individuals).where(eq(schema.individuals.id, id!)).limit(1);
    if (!person) return problem(404, "not_found", "Unknown person.");
  }
  const result = action === "book" ? await bookAppointment(user, {}, form)
    : action === "update" ? await updateAppointment(user, id!, {}, form)
      : action === "document" ? await documentAppointment(user, id!, {}, form)
        : action === "cancelled" || action === "missed" ? await closeAppointment(user, id!, action, {}, form)
          : action === "weight" ? await addWeightRecord(user, id!, {}, form)
            : action === "plan" ? await setWeightPlan(user, id!, {}, form) : await saveContact(user, id!, contactId ?? null, {}, form);
  if (result.error) return problem(400, "refused", result.error);
  revalidatePath("/app", "layout");
  return reply({ ok: true, id: result.id ?? id });
}, { writes: true });
