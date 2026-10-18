import "server-only";
import { and, eq } from "drizzle-orm";
import { officeLocationError, officePoint } from "@/lib/office-work";
import type { SessionUser } from "./auth";
import { db, schema } from "./db";
import { notify, recipients } from "./notify";
import type { clockInContext } from "./queries/timeclock";
import type { Settings } from "./settings";

export async function clockInOfficeFor(user: SessionUser, input: { reason: string; position: { latitude: number; longitude: number; accuracy?: number } | null; statements: string[]; homeId: string | null; shiftId: string | null }, context: Awaited<ReturnType<typeof clockInContext>>, settings: Settings, now: number, client: () => Promise<{ ip: string; userAgent: string }>) {
  if (context.office.error) return { error: context.office.error };
  if (input.homeId || input.shiftId) return { error: "Office work cannot be attached to a care home or care shift." };
  if (input.reason.trim().length < 10) return { error: "Describe the office or administrative work you will do." };
  const locationError = officeLocationError(settings, input.position);
  if (locationError) return { error: locationError };
  const statements = settings.clock_in_requirements.includes("statements") ? settings.clock_in_statements : [];
  const missing = statements.find(statement => !input.statements.includes(statement));
  if (missing) return { error: `Tick: "${missing}"` };
  const metadata = await client(), point = officePoint(settings)!;
  const entry = await db.transaction(async tx => {
    const [entry] = await tx.insert(schema.timeEntries).values({ staffId: user.staffId!, homeId: null, shiftId: null, clockInAt: new Date(now), inLatitude: input.position!.latitude, inLongitude: input.position!.longitude, inAccuracy: Math.round(input.position!.accuracy!), inLocation: "ok", inNote: input.reason, flags: ["office_work"], statements, unscheduled: true, ...metadata }).returning({ id: schema.timeEntries.id });
    await tx.insert(schema.timeEntryChanges).values({ entryId: entry.id, userId: user.id, action: "office_started", reason: input.reason, after: { workType: "office", address: settings.office_work_address, latitude: String(point.latitude), longitude: String(point.longitude), radius: String(settings.office_work_radius) } });
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "time:office_start", entity: "time_entry", entityId: entry.id });
    return entry;
  });
  // Delivery failure must not turn a successful punch into a failed start.
  try { await notify(await recipients({ roles: settings.notify_roles_time, except: user.id }), { kind: "time", title: `${user.name} started office / admin work`, body: input.reason, href: `/app/time/${entry.id}`, tone: "info", dedupeKey: `time:office:${entry.id}` }); } catch { console.error("Office punch saved; manager notification needs retry."); }
  return { entryId: entry.id };
}

/** Original location remains attached to an open office punch if settings change. */
export async function officeSnapshot(entryId: string) {
  const [snapshot] = await db.select({ after: schema.timeEntryChanges.after }).from(schema.timeEntryChanges).where(and(eq(schema.timeEntryChanges.entryId, entryId), eq(schema.timeEntryChanges.action, "office_started"))).limit(1);
  const values = snapshot?.after;
  return values?.workType === "office" ? { latitude: Number(values.latitude), longitude: Number(values.longitude), radius: Number(values.radius), address: values.address } : null;
}
