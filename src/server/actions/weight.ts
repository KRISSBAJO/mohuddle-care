"use server";

import { and, desc, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { addDays, dateKey, fmt } from "@/lib/format";
import { bmi, fastChange, rangeCheck } from "@/lib/weight";
import { canManage } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { homeManagerOf, notify, recipients, type Role } from "@/server/notify";
import { getSettings } from "@/server/settings";
import type { FormState } from "./auth";

const UUID = /^[0-9a-f-]{36}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/* A number from the form, or null when blank. Undefined when it is not a number in range. */
function measure(raw: FormDataEntryValue | null, min: number, max: number): number | null | undefined {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= min && value <= max ? Math.round(value * 10) / 10 : undefined;
}

/* Records and signs one weighing. A new height updates the person's height for later BMIs. */
export async function addWeightRecord(individualId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!UUID.test(individualId)) return { error: "This person no longer exists." };
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, individualId)).limit(1);
  if (!person || !person.active) return { error: "This person is not supported any more." };

  const today = dateKey();
  const recordedOn = String(formData.get("recordedOn") ?? "");
  if (!DAY.test(recordedOn) || recordedOn > today) return { error: "Choose the date of the weighing. It cannot be in the future." };
  if (recordedOn < addDays(today, -366)) return { error: "The date is more than a year ago." };
  const pounds = measure(formData.get("pounds"), 20, 1000);
  if (pounds === null || pounds === undefined) return { error: "Enter the weight in pounds, from 20 to 1,000." };
  const height = measure(formData.get("heightInches"), 24, 96);
  if (height === undefined) return { error: "Height must be in inches, from 24 to 96." };
  const comments = String(formData.get("comments") ?? "").trim();
  if (comments.length > 1000) return { error: "Keep comments under 1,000 characters." };
  if (formData.get("attest") !== "on") return { error: "Confirm the weight is accurate before you sign it." };

  const heightInches = height ?? person.heightInches;
  const [row] = await db
    .insert(schema.weightRecords)
    .values({ individualId, recordedOn, pounds, heightInches, bmi: bmi(pounds, heightInches), comments, staffId: user.staffId, signedName: user.name, signedAt: new Date() })
    .returning({ id: schema.weightRecords.id });
  if (height !== null && height !== person.heightInches) await db.update(schema.individuals).set({ heightInches: height }).where(eq(schema.individuals.id, individualId));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "create", entity: "weight", entityId: row.id });

  // Tell the chosen roles about a weight outside the range or a fast change.
  const settings = await getSettings();
  const recent = await db
    .select({ day: schema.weightRecords.recordedOn, pounds: schema.weightRecords.pounds })
    .from(schema.weightRecords)
    .where(and(eq(schema.weightRecords.individualId, individualId), gte(schema.weightRecords.recordedOn, addDays(recordedOn, -settings.weight_change_days))))
    .orderBy(desc(schema.weightRecords.recordedOn));
  const outside = rangeCheck(pounds, person.weightLow, person.weightHigh);
  const change = fastChange(recent.filter(item => item.day <= recordedOn), settings.weight_change_days, settings.weight_change_percent);
  if (outside || change) {
    const name = `${person.firstName} ${person.lastName}`;
    const parts = [
      outside ? `${pounds} lb is ${outside} the suggested range of ${person.weightLow ?? "?"} to ${person.weightHigh ?? "?"} lb.` : "",
      change ? `${change.percent > 0 ? "Up" : "Down"} ${Math.abs(change.percent)}% since ${fmt.day(change.from.day)} (${change.from.pounds} lb).` : "",
    ].filter(Boolean);
    const ids = await recipients({ roles: settings.notify_roles_weight as Role[], staffIds: [await homeManagerOf(person.homeId)], except: user.id });
    await notify(ids, { kind: "weight:alert", title: `${name}'s weight needs a look`, body: parts.join(" "), href: `/app/individuals/${individualId}?tab=health`, tone: "warn", dedupeKey: `weight:alert:${row.id}` });
  }
  revalidatePath(`/app/individuals/${individualId}`);
  return {};
}

/* The suggested range and height, set by managers and nurses. */
export async function setWeightPlan(individualId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!canManage(user) && user.role !== "nurse") return { error: "Only managers and nurses can change the weight range." };
  if (!UUID.test(individualId)) return { error: "This person no longer exists." };
  const weightLow = measure(formData.get("weightLow"), 20, 1000);
  const weightHigh = measure(formData.get("weightHigh"), 20, 1000);
  const heightInches = measure(formData.get("heightInches"), 24, 96);
  if (weightLow === undefined || weightHigh === undefined) return { error: "Range weights must be in pounds, from 20 to 1,000." };
  if (heightInches === undefined) return { error: "Height must be in inches, from 24 to 96." };
  if (weightLow !== null && weightHigh !== null && weightLow >= weightHigh) return { error: "The low end of the range must be below the high end." };
  await db.update(schema.individuals).set({ weightLow, weightHigh, heightInches }).where(eq(schema.individuals.id, individualId));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "update:weight-plan", entity: "individual", entityId: individualId });
  revalidatePath(`/app/individuals/${individualId}`);
  return {};
}

/* Removes a weighing entered by mistake. Managers only; the removal is in the audit log. */
export async function removeWeightRecord(id: string): Promise<FormState> {
  const user = await requireUser();
  if (!canManage(user)) return { error: "Only managers can remove a weight." };
  if (!UUID.test(id)) return { error: "This weight no longer exists." };
  const [row] = await db.delete(schema.weightRecords).where(eq(schema.weightRecords.id, id)).returning({ individualId: schema.weightRecords.individualId, pounds: schema.weightRecords.pounds, day: schema.weightRecords.recordedOn });
  if (!row) return { error: "This weight no longer exists." };
  await db.insert(schema.auditLog).values({ userId: user.id, action: `delete:weight ${row.pounds} lb on ${row.day}`, entity: "individual", entityId: row.individualId });
  revalidatePath(`/app/individuals/${row.individualId}`);
  return {};
}
