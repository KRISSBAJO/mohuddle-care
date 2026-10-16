"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { label, zonedTime } from "@/lib/format";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";
import { requireManager, requireUser } from "@/server/guard";
import { addIncidentNoteFor, incidentById, startIncidentReviewFor, timelineNote } from "@/server/incident-follow-up";
import { fileIncident } from "@/server/incident-report";
import type { FormState } from "./auth";

const load = incidentById;
const note = timelineNote;

function refresh(id: string) {
  revalidatePath(`/app/incidents/${id}`);
  revalidatePath("/app/incidents");
  revalidatePath("/app");
}

/* Anyone can add what they learned later. The original account is never edited. */
export async function addIncidentNote(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await addIncidentNoteFor(user, id, String(formData.get("body") ?? ""));
  if (result.error) return result;
  refresh(id);
  return {};
}

const detailsInput = z.object({
  category: z.enum(schema.incidentCategory.enumValues),
  severity: z.enum(schema.incidentSeverity.enumValues),
  reportable: z.literal("on").optional().transform(Boolean),
  actionsTaken: z.string().trim().max(3000).default(""),
});

/* Coordinators correct the classification and record actions. Every change is written to the timeline. */
export async function updateIncidentDetails(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const incident = await load(id);
  if (!incident) return { error: "This incident no longer exists." };
  const parsed = detailsInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Check the category and severity." };
  const next = parsed.data;
  if (incident.stateFiledAt && !next.reportable) return { error: "This incident was filed with the state. Remove the filing record before marking it not reportable." };
  const changes: string[] = [];
  if (next.category !== incident.category) changes.push(`Category ${label("incidentCategory", incident.category)} → ${label("incidentCategory", next.category)}`);
  if (next.severity !== incident.severity) changes.push(`Severity ${label("incidentSeverity", incident.severity)} → ${label("incidentSeverity", next.severity)}`);
  if (next.reportable !== incident.reportable) changes.push(next.reportable ? "Marked reportable to the state" : "Marked not reportable");
  if (next.actionsTaken !== incident.actionsTaken) changes.push("Actions taken updated");
  if (!changes.length) return {};
  await db.transaction(async tx => {
    await tx.update(schema.incidents).set(next).where(eq(schema.incidents.id, id));
    await note(tx, id, user.id, "change", changes.join(". ") + ".");
  });
  refresh(id);
  return {};
}

/* Records that a reportable incident was filed with the state, with the state's reference. */
export async function recordStateFiling(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const incident = await load(id);
  if (!incident) return { error: "This incident no longer exists." };
  if (!incident.reportable) return { error: "Only reportable incidents are filed with the state." };
  const raw = String(formData.get("filedAt") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return { error: "Enter when it was filed." };
  const [day, time] = raw.split("T");
  const filedAt = zonedTime(day, time);
  if (filedAt.getTime() > Date.now() + 5 * 60_000) return { error: "The filing time cannot be in the future." };
  if (filedAt.getTime() < incident.occurredAt.getTime()) return { error: "It cannot be filed before the incident happened." };
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 80);
  await db.transaction(async tx => {
    await tx.update(schema.incidents).set({ stateFiledAt: filedAt, stateReference: reference, stateFiledBy: user.id }).where(eq(schema.incidents.id, id));
    await note(tx, id, user.id, "filing", `Filed with the state${reference ? `, reference ${reference}` : ""}.`);
  });
  refresh(id);
  return {};
}

export async function removeStateFiling(id: string): Promise<FormState> {
  const user = await requireManager();
  const incident = await load(id);
  if (!incident?.stateFiledAt) return { error: "There is no filing record to remove." };
  if (incident.status === "closed") return { error: "Reopen the incident before changing its filing record." };
  await db.transaction(async tx => {
    await tx.update(schema.incidents).set({ stateFiledAt: null, stateReference: "", stateFiledBy: null }).where(eq(schema.incidents.id, id));
    await note(tx, id, user.id, "change", "Filing record removed.");
  });
  refresh(id);
  return {};
}

export async function startIncidentReview(id: string): Promise<FormState> {
  const user = await requireManager();
  const result = await startIncidentReviewFor(user, id);
  if (result.error) return result;
  refresh(id);
  return {};
}

/* Closing needs an outcome, and a reportable incident must be filed with the state first. */
export async function closeIncident(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const incident = await load(id);
  if (!incident) return { error: "This incident no longer exists." };
  if (incident.status === "closed") return { error: "It is already closed." };
  if (incident.reportable && !incident.stateFiledAt) return { error: "This incident is reportable. Record the state filing before closing it." };
  const outcome = String(formData.get("outcome") ?? "").trim();
  if (outcome.length < 5) return { error: "Write the outcome: what was found and what changes as a result." };
  const closed = await db.transaction(async tx => {
    const updated = await tx
      .update(schema.incidents)
      .set({ status: "closed", closedAt: new Date() })
      .where(and(eq(schema.incidents.id, id), ne(schema.incidents.status, "closed")))
      .returning({ id: schema.incidents.id });
    if (!updated.length) return false;
    await note(tx, id, user.id, "closed", outcome.slice(0, 3000));
    return true;
  });
  if (!closed) return { error: "It was closed by someone else. Refresh the page." };
  refresh(id);
  return {};
}

export async function reopenIncident(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const incident = await load(id);
  if (!incident || incident.status !== "closed") return { error: "Only closed incidents can be reopened." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Say why it is being reopened." };
  await db.transaction(async tx => {
    await tx.update(schema.incidents).set({ status: "under_review", closedAt: null }).where(eq(schema.incidents.id, id));
    await note(tx, id, user.id, "reopened", reason.slice(0, 3000));
  });
  refresh(id);
  return {};
}

/* ---------- The Reportable Event Form ---------- */

/* Files the Reportable Event Form from the website. The rules are in src/server/incident-report.ts. */
export async function submitReportableEvent(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "The form could not be read. Reload the page and try again." };
  }
  const result = await fileIncident(user, raw);
  if (result.error !== undefined) return { error: result.error };
  refresh(result.id);
  redirect(`/app/incidents/${result.id}`);
}

/* Records someone told about an incident after it was filed: the party, when, and any comments. */
export async function addIncidentNotification(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const incident = await load(id);
  if (!incident) return { error: "That incident no longer exists." };
  const settings = await getSettings();
  const party = String(formData.get("party") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const at = String(formData.get("time") ?? "");
  if (!settings.incident_notify_parties.includes(party)) return { error: "Choose who was notified." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) return { error: "Enter the date and time they were notified." };
  const when = zonedTime(date, at);
  if (when.getTime() > Date.now() + 5 * 60_000) return { error: "That time is in the future." };
  const entry = { party, at: when.toISOString(), name: String(formData.get("name") ?? "").trim().slice(0, 160), comments: String(formData.get("comments") ?? "").trim().slice(0, 1000) };
  await db.transaction(async tx => {
    await tx.update(schema.incidents).set({ notifications: [...incident.notifications, entry] }).where(eq(schema.incidents.id, id));
    await note(tx, id, user.id, "notified", `${party} notified ${date} ${at}${entry.name ? ` (${entry.name})` : ""}${entry.comments ? `: ${entry.comments}` : ""}`);
  });
  refresh(id);
  return {};
}
