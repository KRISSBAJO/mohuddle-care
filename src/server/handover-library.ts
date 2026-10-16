import "server-only";
import { eq } from "drizzle-orm";
import { DEFAULT_HANDOVER_LIBRARY } from "@/lib/handover-library";
import { schema, systemDb } from "./db";

const KEY = "handover_library";

/* The shift-change items Mohuddle offers every agency, as the owner last saved them. */
export async function handoverLibrary(): Promise<string[]> {
  const [row] = await systemDb.select().from(schema.platformSettings).where(eq(schema.platformSettings.key, KEY)).limit(1);
  const saved = row?.value;
  return Array.isArray(saved) && saved.every(item => typeof item === "string") ? (saved as string[]) : DEFAULT_HANDOVER_LIBRARY;
}

export async function saveHandoverLibrary(items: string[]) {
  await systemDb.insert(schema.platformSettings).values({ key: KEY, value: items }).onConflictDoUpdate({ target: schema.platformSettings.key, set: { value: items, updatedAt: new Date() } });
}
