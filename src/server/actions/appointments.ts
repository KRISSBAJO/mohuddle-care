"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dateKey, fmt, zonedTime } from "@/lib/format";
import { db, schema } from "@/server/db";
import { canManage, type SessionUser } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { homeManagerOf, notify, recipients } from "@/server/notify";
import { getSettings } from "@/server/settings";
import type { FormState } from "./auth";

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max).default("");

const bookingInput = z.object({
  type: z.string().trim().min(1, "Choose the type of appointment.").max(80),
  provider: text(120),
  clinic: text(120),
  address: text(200),
  phone: text(40),
  date: z.iso.date("Choose the date."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose the time."),
  durationMinutes: z.coerce.number().int().min(5).max(600).default(60),
  reason: text(1000),
  prep: text(1000),
  transport: text(200),
  escortStaffId: z.union([z.literal(""), uuid]).transform(value => value || null),
});

/* Booking and changing visits is for coordinators, nurses and whoever booked it. Anyone can document one. */
function mayChange(user: SessionUser, appointment: { createdBy: string | null }) {
  return canManage(user) || user.role === "nurse" || appointment.createdBy === user.id;
}

async function personOf(id: string) {
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, id)).limit(1);
  return person ?? null;
}

function refresh(id: string, individualId: string) {
  revalidatePath("/app/appointments");
  revalidatePath(`/app/appointments/${id}`);
  revalidatePath(`/app/individuals/${individualId}`);
  revalidatePath("/app");
}

const when = (at: Date) => `${fmt.weekday(dateKey(at))} ${fmt.day(at)} at ${fmt.time(at)}`;

/* Tells the escort, the home manager and the roles chosen in Settings. */
async function tellTeam(user: SessionUser, appointment: { id: string; escortStaffId: string | null }, person: { homeId: string | null }, message: Omit<Parameters<typeof notify>[1], "href">, extraStaff: (string | null)[] = []) {
  const settings = await getSettings();
  const to = await recipients({ roles: settings.notify_roles_appointments, staffIds: [appointment.escortStaffId, await homeManagerOf(person.homeId), ...extraStaff], except: user.id });
  await notify(to, { ...message, href: `/app/appointments/${appointment.id}` });
}

function readBooking(formData: FormData) {
  const parsed = bookingInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the appointment details." } as const;
  const { date, time, ...rest } = parsed.data;
  return { data: { ...rest, scheduledAt: zonedTime(date, time) } } as const;
}

/* Books an appointment. A follow-up links back to the visit that asked for it. */
export async function bookAppointment(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const individualId = String(formData.get("individualId") ?? "");
  if (!uuid.safeParse(individualId).success) return { error: "Choose who the appointment is for." };
  const person = await personOf(individualId);
  if (!person?.active) return { error: "Choose someone currently supported." };
  const booking = readBooking(formData);
  if ("error" in booking) return { error: booking.error };
  const followUpOf = String(formData.get("followUpOf") ?? "");
  const row = await db.transaction(async tx => {
    const [row] = await tx
      .insert(schema.appointments)
      .values({ ...booking.data, individualId, createdBy: user.id, followUpOf: uuid.safeParse(followUpOf).success ? followUpOf : null })
      .returning({ id: schema.appointments.id, escortStaffId: schema.appointments.escortStaffId });
    if (uuid.safeParse(followUpOf).success) await tx.update(schema.appointments).set({ nextAppointmentId: row.id }).where(eq(schema.appointments.id, followUpOf));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "appointment:book", entity: "appointment", entityId: row.id });
    return row;
  });
  await tellTeam(user, row, person, {
    kind: "appointment:booked",
    title: `${booking.data.type} booked for ${person.firstName} ${person.lastName}`,
    body: `${when(booking.data.scheduledAt)}${booking.data.provider ? ` with ${booking.data.provider}` : ""}${booking.data.clinic ? `, ${booking.data.clinic}` : ""}.`,
    tone: "info",
    dedupeKey: `appointment:booked:${row.id}`,
  });
  refresh(row.id, individualId);
  redirect(`/app/appointments/${row.id}?booked=1`);
}

/* Changes the details or time. A new time or escort is sent to the team again. */
export async function updateAppointment(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "Unknown appointment." };
  const [existing] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)).limit(1);
  if (!existing) return { error: "This appointment no longer exists." };
  if (!mayChange(user, existing)) return { error: "Only coordinators, nurses or the person who booked it can change it." };
  if (existing.status !== "scheduled") return { error: "Only booked appointments can be changed." };
  const booking = readBooking(formData);
  if ("error" in booking) return { error: booking.error };
  await db.update(schema.appointments).set(booking.data).where(eq(schema.appointments.id, id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "appointment:update", entity: "appointment", entityId: id });
  const moved = existing.scheduledAt.getTime() !== booking.data.scheduledAt.getTime();
  if (moved || existing.escortStaffId !== booking.data.escortStaffId) {
    const person = await personOf(existing.individualId);
    if (person) {
      await tellTeam(
        user,
        { id, escortStaffId: booking.data.escortStaffId },
        person,
        {
          kind: "appointment:changed",
          title: `${booking.data.type} for ${person.firstName} ${moved ? "moved" : "has a new escort"}`,
          body: moved ? `Now ${when(booking.data.scheduledAt)} (was ${when(existing.scheduledAt)}).` : `${when(booking.data.scheduledAt)}.`,
          tone: "warn",
          dedupeKey: `appointment:changed:${id}:${booking.data.scheduledAt.getTime()}:${booking.data.escortStaffId ?? "none"}`,
        },
        [existing.escortStaffId],
      );
    }
  }
  refresh(id, existing.individualId);
  redirect(`/app/appointments/${id}`);
}

/* Cancelled or missed, with the reason. Both stay on record. */
export async function closeAppointment(id: string, status: "cancelled" | "missed", _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success || !["cancelled", "missed"].includes(status)) return { error: "Unknown appointment." };
  const [existing] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)).limit(1);
  if (!existing) return { error: "This appointment no longer exists." };
  if (!mayChange(user, existing)) return { error: "Only coordinators, nurses or the person who booked it can change it." };
  if (existing.status !== "scheduled") return { error: "This appointment is already closed." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: status === "cancelled" ? "Say why it was cancelled." : "Say why it was missed." };
  await db.update(schema.appointments).set({ status, statusReason: reason.slice(0, 500) }).where(eq(schema.appointments.id, id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: `appointment:${status}`, entity: "appointment", entityId: id });
  const person = await personOf(existing.individualId);
  if (person) {
    await tellTeam(user, existing, person, {
      kind: `appointment:${status}`,
      title: `${existing.type} for ${person.firstName} ${status === "cancelled" ? "cancelled" : "was missed"}`,
      body: `${when(existing.scheduledAt)}. ${reason}`,
      tone: status === "missed" ? "bad" : "warn",
      dedupeKey: `appointment:${status}:${id}`,
    });
  }
  refresh(id, existing.individualId);
  return {};
}

const visitInput = z.object({
  seenBy: text(120),
  summary: z.string().trim().min(10, "Write what happened at the visit: what was checked and what the clinician said.").max(5000),
  diagnosisChanges: text(2000),
  medicationChanges: text(2000),
  orders: text(2000),
  followUpNeeded: z.literal("on").optional().transform(Boolean),
  followUpBy: z.union([z.literal(""), z.iso.date()]).transform(value => value || null),
  followUpNotes: text(1000),
});

/*
 * Records what happened at the visit. Medication changes are flagged to nurses and coordinators.
 * If a follow-up is needed it can be booked in the same step, or later from the appointment.
 */
export async function documentAppointment(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "Unknown appointment." };
  const [existing] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)).limit(1);
  if (!existing) return { error: "This appointment no longer exists." };
  if (existing.status !== "scheduled") return { error: "This appointment is already closed." };
  if (existing.scheduledAt.getTime() > Date.now() + 3_600_000) return { error: "You can document a visit from an hour before it starts." };
  const parsed = visitInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the visit notes." };
  const visit = parsed.data;
  if (!visit.followUpNeeded) {
    visit.followUpBy = null;
    visit.followUpNotes = "";
  }
  const nextDate = String(formData.get("nextDate") ?? "");
  const nextTime = String(formData.get("nextTime") ?? "");
  const bookNext = visit.followUpNeeded && /^\d{4}-\d{2}-\d{2}$/.test(nextDate) && /^([01]\d|2[0-3]):[0-5]\d$/.test(nextTime);
  if (bookNext && zonedTime(nextDate, nextTime).getTime() <= existing.scheduledAt.getTime()) return { error: "The next appointment must be after this one." };
  const person = await personOf(existing.individualId);
  const nextId = await db.transaction(async tx => {
    let next: string | null = null;
    if (bookNext) {
      const [row] = await tx
        .insert(schema.appointments)
        .values({
          individualId: existing.individualId,
          type: existing.type,
          provider: existing.provider,
          clinic: existing.clinic,
          address: existing.address,
          phone: existing.phone,
          scheduledAt: zonedTime(nextDate, nextTime),
          durationMinutes: existing.durationMinutes,
          reason: visit.followUpNotes || `Follow-up from ${fmt.day(existing.scheduledAt)}`,
          transport: existing.transport,
          escortStaffId: existing.escortStaffId,
          followUpOf: existing.id,
          createdBy: user.id,
        })
        .returning({ id: schema.appointments.id });
      next = row.id;
    }
    await tx
      .update(schema.appointments)
      .set({ ...visit, status: "completed", documentedBy: user.id, documentedAt: new Date(), nextAppointmentId: next })
      .where(eq(schema.appointments.id, id));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "appointment:document", entity: "appointment", entityId: id });
    return next;
  });

  if (person) {
    const settings = await getSettings();
    const manager = await homeManagerOf(person.homeId);
    if (visit.medicationChanges) {
      const to = await recipients({ roles: Array.from(new Set([...settings.notify_roles_appointments, "nurse" as const])), staffIds: [manager], except: user.id });
      await notify(to, {
        kind: "appointment:medication",
        title: `Medication change after ${person.firstName}'s ${existing.type.toLowerCase()} visit`,
        body: `${visit.medicationChanges.slice(0, 300)} Update the medication orders to match.`,
        href: `/app/appointments/${id}`,
        tone: "bad",
        dedupeKey: `appointment:medication:${id}`,
      });
    }
    if (visit.followUpNeeded && !nextId) {
      const to = await recipients({ roles: settings.notify_roles_appointments, staffIds: [manager], except: user.id });
      await notify(to, {
        kind: "appointment:follow-up",
        title: `Book a follow-up for ${person.firstName}`,
        body: `${existing.type}${existing.provider ? ` with ${existing.provider}` : ""} asked for a follow-up${visit.followUpBy ? ` by ${fmt.day(visit.followUpBy)}` : ""}.`,
        href: `/app/appointments/${id}`,
        tone: "warn",
        dedupeKey: `appointment:follow-up:${id}`,
      });
    }
    if (nextId) {
      await tellTeam(user, { id: nextId, escortStaffId: existing.escortStaffId }, person, {
        kind: "appointment:booked",
        title: `Follow-up booked for ${person.firstName}`,
        body: `${existing.type} on ${when(zonedTime(nextDate, nextTime))}.`,
        tone: "info",
        dedupeKey: `appointment:booked:${nextId}`,
      });
    }
  }
  refresh(id, existing.individualId);
  if (nextId) revalidatePath(`/app/appointments/${nextId}`);
  return {};
}
