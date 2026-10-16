import type { DoseResult, DoseStatus } from "./api";
import { readValue, removeValue, writeValue } from "./storage";

/*
 * Doses recorded with no signal wait here, in the phone's secure storage, until they can be sent.
 * Only regular scheduled doses come here; controlled medicines need a signal. Each dose is kept
 * under its own key (secure storage holds small values) with a list of the waiting ones. A dose
 * belongs to the login that recorded it and is only ever sent with that login.
 */

export type Queued = { adminId: string; status: DoseStatus; note: string; at: string; owner: string; label: string };

const INDEX = "mohuddle.outbox";
const key = (adminId: string) => `mohuddle.outbox.${adminId}`;

async function ids(): Promise<string[]> {
  try {
    return JSON.parse((await readValue(INDEX)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export async function queueDose(dose: Queued) {
  await writeValue(key(dose.adminId), JSON.stringify(dose));
  const list = await ids();
  if (!list.includes(dose.adminId)) await writeValue(INDEX, JSON.stringify([...list, dose.adminId]));
}

export async function queuedDoses(owner?: string): Promise<Queued[]> {
  const all = await Promise.all((await ids()).map(async id => JSON.parse((await readValue(key(id))) ?? "null") as Queued | null));
  return all.filter((dose): dose is Queued => Boolean(dose) && (!owner || dose!.owner === owner));
}

async function forget(adminIds: string[]) {
  await Promise.all(adminIds.map(id => removeValue(key(id))));
  const left = (await ids()).filter(id => !adminIds.includes(id));
  await writeValue(INDEX, JSON.stringify(left));
}

/*
 * Sends this login's waiting doses. Each one that the server answers (recorded, or refused because
 * someone already recorded it) leaves the outbox; the refusals come back so the screen can say who.
 * When there is still no signal, everything stays.
 */
export async function sendQueued(owner: string, send: (doses: Queued[]) => Promise<DoseResult[]>): Promise<{ sent: number; refused: (DoseResult & { ok: false; label: string })[] } | null> {
  const waiting = await queuedDoses(owner);
  if (!waiting.length) return { sent: 0, refused: [] };
  let results: DoseResult[];
  try {
    results = await send(waiting);
  } catch {
    return null;
  }
  await forget(results.map(result => result.adminId));
  return {
    sent: results.filter(result => result.ok).length,
    refused: results.filter((result): result is DoseResult & { ok: false } => !result.ok).map(result => ({ ...result, label: waiting.find(dose => dose.adminId === result.adminId)?.label ?? "A dose" })),
  };
}
