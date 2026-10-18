"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { officeAccessChangeError, officePoint } from "@/lib/office-work";
import { db, schema } from "@/server/db";
import { requireManager } from "@/server/guard";
import { settingDefs } from "@/server/settings";
import type { FormState } from "./auth";
const keys = ["office_work_enabled", "office_work_staff", "office_work_address", "office_work_latitude", "office_work_longitude", "office_work_radius"] as const;
export async function saveOfficePolicy(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await requireManager();
  if (user.role !== "admin") return { error: "An administrator must configure office work access." };
  const values: Record<string, unknown> = {};
  for (const key of keys) {
    const raw = String(form.get(key) ?? "");
    const parsed = settingDefs[key].schema.safeParse(key === "office_work_staff" ? [...new Set(raw.split("\n").map(item => item.trim()).filter(Boolean))] : raw);
    if (!parsed.success) return { error: `${settingDefs[key].label}: ${parsed.error.issues[0]?.message}` };
    values[key] = parsed.data;
  }
  const staffIds = values.office_work_staff as string[];
  const staff = staffIds.length ? await db.select({ id: schema.staff.id }).from(schema.staff).where(and(inArray(schema.staff.id, staffIds), eq(schema.staff.active, true))) : [];
  if (staff.length !== staffIds.length) return { error: "Select active staff in this agency." };
  if (values.office_work_enabled === "on" && (!values.office_work_address || !officePoint(values as unknown as Parameters<typeof officePoint>[0]))) return { error: "Set the office address, latitude and longitude before enabling office starts." };
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('office_work_policy'))`);
    const currentRows = await tx.select().from(schema.settings).where(inArray(schema.settings.key, [...keys]));
    const current = currentRows.find(row => row.key === "office_work_staff");
    const before = settingDefs.office_work_staff.schema.safeParse(current?.value);
    const approved = before.success ? before.data : [];
    const error = officeAccessChangeError(user.role, user.staffId, approved, staffIds);
    if (error) return { error };
    for (const key of keys) await tx.insert(schema.settings).values({ key, value: values[key], updatedAt: new Date() }).onConflictDoUpdate({ target: [schema.settings.agencyId, schema.settings.key], set: { value: values[key], updatedAt: new Date() } });
    for (const id of staffIds.filter(id => !approved.includes(id))) await tx.insert(schema.auditLog).values({ userId: user.id, action: "office_access:grant", entity: "staff", entityId: id });
    for (const id of approved.filter(id => !staffIds.includes(id))) await tx.insert(schema.auditLog).values({ userId: user.id, action: "office_access:revoke", entity: "staff", entityId: id });
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "office_policy:update", entity: "settings", entityId: JSON.stringify({ before: Object.fromEntries(currentRows.filter(row => row.key !== "office_work_staff").map(row => [row.key, row.value])), after: Object.fromEntries(Object.entries(values).filter(([key]) => key !== "office_work_staff")) }) });
    return {};
  });
  if (result.error) return result;
  revalidatePath("/app", "layout"); return {};
}
