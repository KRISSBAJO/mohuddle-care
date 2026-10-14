import "server-only";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";

/*
 * Business rules are dashboard settings stored in the database, never fixed in code.
 * This file only names them, gives a safe default, and checks what comes back.
 */
export const settingDefs = {
  credential_warning_days: {
    label: "Warn about expiring credentials this many days ahead",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(365),
    fallback: 30,
  },
  daily_log_due_hour: {
    label: "Daily logs are due by this hour (0 to 23, Central time)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(23),
    fallback: 22,
  },
  med_late_minutes: {
    label: "A medication counts as late after this many minutes",
    kind: "number",
    schema: z.coerce.number().int().min(5).max(240),
    fallback: 60,
  },
  incident_report_hours: {
    label: "Reportable incidents must be filed within this many hours",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(72),
    fallback: 24,
  },
  shift_coverage_minimum: {
    label: "Minimum staff per home per shift",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(10),
    fallback: 1,
  },
  required_daily_checks: {
    label: "Required checks on every daily log (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: [
      "Personal care supported",
      "Meals and fluids offered",
      "Medications reviewed",
      "Home safety walk",
      "Goal activity offered",
    ],
  },
  credential_types: {
    label: "Credential types tracked for staff (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["CPR and First Aid", "DIDD Core Training", "Background Check", "Medication Administration", "Driver Licence"],
  },
} as const;

export type SettingKey = keyof typeof settingDefs;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingDefs)[K]["schema"]> };

export async function getSettings(): Promise<Settings> {
  const keys = Object.keys(settingDefs) as SettingKey[];
  const rows = await db.select().from(schema.settings).where(inArray(schema.settings.key, keys));
  const stored = new Map(rows.map(row => [row.key, row.value]));
  const out = {} as Record<string, unknown>;
  for (const key of keys) {
    const def = settingDefs[key];
    const parsed = def.schema.safeParse(stored.get(key));
    out[key] = parsed.success ? parsed.data : def.fallback;
  }
  return out as Settings;
}

export async function saveSetting(key: SettingKey, raw: unknown) {
  const def = settingDefs[key];
  const parsed = def.schema.safeParse(raw);
  if (!parsed.success) throw new Error(`${def.label}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  await db
    .insert(schema.settings)
    .values({ key, value: parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed.data, updatedAt: new Date() } });
}
