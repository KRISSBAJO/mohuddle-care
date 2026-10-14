import "server-only";
import { activePatterns } from "@/server/queries/patterns";

/*
 * A home that ticks every active pattern is staffed around the clock, so it is stored as null
 * and picks up any pattern added later. Anything less is kept as the exact list.
 */
export async function normaliseStaffing<T extends { staffedPatterns?: string[] | null }>(data: T): Promise<T> {
  if (!data.staffedPatterns) return data;
  const active = (await activePatterns()).map(pattern => pattern.id);
  const chosen = data.staffedPatterns.filter(id => active.includes(id));
  return { ...data, staffedPatterns: active.length > 0 && active.every(id => chosen.includes(id)) ? null : chosen };
}
