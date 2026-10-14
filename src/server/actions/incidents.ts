"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { label, zonedTime } from "@/lib/format";
import { INJURED_PARTIES, INVOLVEMENT_QUESTIONS, categoryFor, eventLabel, eventTier, isEventKey, isInterventionKey } from "@/lib/reportable-events";
import { db, schema } from "@/server/db";
import { homeManagerOf, notify, recipients } from "@/server/notify";
import { getSettings } from "@/server/settings";
import { requireManager, requireUser } from "@/server/guard";
import type { FormState } from "./auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid = z.uuid();

async function load(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const [incident] = await db.select().from(schema.incidents).where(eq(schema.incidents.id, id)).limit(1);
  return incident ?? null;
}

async function note(tx: Tx, incidentId: string, userId: string, kind: string, body: string) {
  await tx.insert(schema.incidentNotes).values({ incidentId, userId, kind, body });
  // Its own action name, so the timeline never mistakes it for an older status change from the audit log.
  await tx.insert(schema.auditLog).values({ userId, action: `incident:timeline:${kind}`, entity: "incident", entityId: incidentId });
}

function refresh(id: string) {
  revalidatePath(`/app/incidents/${id}`);
  revalidatePath("/app/incidents");
  revalidatePath("/app");
}

/* Anyone can add what they learned later. The original account is never edited. */
export async function addIncidentNote(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const incident = await load(id);
  if (!incident) return { error: "This incident no longer exists." };
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 3) return { error: "Write the follow-up note first." };
  if (body.length > 3000) return { error: "Keep a note under 3,000 characters." };
  await db.transaction(tx => note(tx, id, user.id, "note", body));
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
  const incident = await load(id);
  if (!incident) return { error: "This incident no longer exists." };
  if (incident.status !== "open") return { error: "Only open incidents can move to review." };
  await db.transaction(async tx => {
    await tx.update(schema.incidents).set({ status: "under_review" }).where(eq(schema.incidents.id, id));
    await note(tx, id, user.id, "review", "Review started.");
  });
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

const day = z.union([z.literal(""), z.iso.date()]).default("");
const time = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).default("");
const text = (max: number) => z.string().trim().max(max).default("");

const refInput = z.object({
  individualId: z.union([z.literal(""), z.uuid()]).default(""),
  homeId: z.union([z.literal(""), z.uuid()]).default(""),
  responsibleProvider: text(160),
  reportingProvider: text(160),
  personAlias: text(120),
  waiverType: text(80),
  mco: text(80),
  mcoNumber: text(60),
  eventLocation: text(80),
  eventAddress: text(300),
  eventCity: text(80),
  eventState: text(40),
  eventZip: text(12),
  eventRegion: z.enum(["", "east", "middle", "west"]).default(""),
  occurredDate: day,
  occurredTime: time,
  occurredUnknown: z.boolean().default(false),
  discoveredDate: day,
  discoveredTime: time,
  witnessType: z.enum(["", "witnessed", "discovered"]).default(""),
  witnessedBy: text(160),
  eventTypes: z.array(z.string()).max(80).default([]),
  otherEventText: text(1000),
  injuredParties: z.array(z.enum(Object.keys(INJURED_PARTIES) as [keyof typeof INJURED_PARTIES, ...(keyof typeof INJURED_PARTIES)[]])).max(3).default([]),
  interventions: z.array(z.string()).max(40).default([]),
  prnGivenBy: text(160),
  involvement: z.record(z.string(), z.enum(["yes", "no"])).default({}),
  description: z.string().trim().min(20, "Describe the event: what, when, where, who and why, in at least a sentence or two.").max(8000),
  injury: z.enum(["yes", "no"], "Say whether the person was injured."),
  injuryDetails: text(3000),
  actionsTaken: text(3000),
  severity: z.enum(schema.incidentSeverity.enumValues).default("low"),
  notifications: z.array(z.object({ party: z.string().trim().min(1).max(160), date: day, time, name: text(160), comments: text(1000) })).max(30).default([]),
});

/*
 * Files the state's Reportable Event Form. When a person is chosen, their details come from their
 * record, so nothing is typed twice. The tier sets how fast it must reach the state, and the team
 * is told at once.
 */
export async function submitReportableEvent(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "The form could not be read. Reload the page and try again." };
  }
  const parsed = refInput.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;
  const settings = await getSettings();

  const eventTypes = [...new Set(input.eventTypes.filter(isEventKey))];
  const interventions = [...new Set(input.interventions.filter(isInterventionKey))];
  let tier = eventTier(eventTypes);
  if (!tier && input.otherEventText) tier = "reportable";
  if (tier && !input.individualId) return { error: "Choose the person supported. A reportable event is always about a person." };
  if (eventTypes.includes("b_injury_to_other") && !input.injuredParties.length) return { error: "Say who was injured: a housemate, a private citizen or staff." };
  if (interventions.includes("i_prn_psychotropic") && !input.prnGivenBy) return { error: "Say who gave the PRN psychotropic medication." };
  if (input.injury === "yes" && input.injuryDetails.length < 5) return { error: "Describe the injury." };

  const now = Date.now();
  let occurredAt: Date;
  let discoveredAt: Date | null = null;
  if (input.occurredUnknown) {
    if (!input.discoveredDate || !input.discoveredTime) return { error: "The time of the event is unknown, so enter when it was discovered." };
    discoveredAt = zonedTime(input.discoveredDate, input.discoveredTime);
    occurredAt = discoveredAt;
  } else {
    if (!input.occurredDate || !input.occurredTime) return { error: "Enter the date and time of the event, or tick Unknown." };
    occurredAt = zonedTime(input.occurredDate, input.occurredTime);
    if (input.discoveredDate && input.discoveredTime) discoveredAt = zonedTime(input.discoveredDate, input.discoveredTime);
  }
  if (occurredAt.getTime() > now + 5 * 60_000) return { error: "The event time is in the future." };

  const notifications: { party: string; at: string | null; name: string; comments: string }[] = [];
  for (const row of input.notifications) {
    if (!settings.incident_notify_parties.includes(row.party)) continue;
    if (!row.date || !row.time) return { error: `Enter when ${row.party} was notified.` };
    const at = zonedTime(row.date, row.time);
    if (at.getTime() > now + 5 * 60_000) return { error: `The time ${row.party} was notified is in the future.` };
    notifications.push({ party: row.party, at: at.toISOString(), name: row.name, comments: row.comments });
  }

  let person: { first: string; last: string; homeId: string | null } | undefined;
  if (input.individualId) {
    [person] = await db.select({ first: schema.individuals.firstName, last: schema.individuals.lastName, homeId: schema.individuals.homeId }).from(schema.individuals).where(eq(schema.individuals.id, input.individualId)).limit(1);
    if (!person) return { error: "That person is no longer on record." };
  }
  const homeId = input.homeId || person?.homeId || null;
  const category = categoryFor(eventTypes);
  const severity = tier === "tier1" ? "critical" : tier === "tier2" && input.severity === "low" ? "moderate" : input.severity;

  const [row] = await db
    .insert(schema.incidents)
    .values({
      individualId: input.individualId || null,
      homeId,
      reportedBy: user.staffId,
      occurredAt,
      category,
      severity,
      description: input.description,
      actionsTaken: input.actionsTaken,
      reportable: Boolean(tier),
      responsibleProvider: input.responsibleProvider,
      reportingProvider: input.reportingProvider,
      personAlias: input.personAlias,
      waiverType: input.waiverType,
      mco: input.mco,
      mcoNumber: input.mcoNumber,
      eventLocation: input.eventLocation,
      eventAddress: input.eventAddress,
      eventCity: input.eventCity,
      eventState: input.eventState,
      eventZip: input.eventZip,
      eventRegion: input.eventRegion,
      occurredUnknown: input.occurredUnknown,
      discoveredAt,
      witnessType: input.witnessType,
      witnessedBy: input.witnessedBy,
      eventTypes,
      otherEventText: input.otherEventText,
      injuredParties: eventTypes.includes("b_injury_to_other") ? input.injuredParties : [],
      interventions,
      prnGivenBy: interventions.includes("i_prn_psychotropic") ? input.prnGivenBy : "",
      injury: input.injury,
      injuryDetails: input.injury === "yes" ? input.injuryDetails : "",
      involvement: Object.fromEntries(Object.entries(input.involvement).filter(([key]) => INVOLVEMENT_QUESTIONS.some(question => question.key === key))),
      notifications,
      tier,
    })
    .returning({ id: schema.incidents.id });
  await db.insert(schema.auditLog).values({ userId: user.id, action: "create", entity: "incident", entityId: row.id });

  const to = await recipients({ roles: settings.notify_roles_incidents, staffIds: [await homeManagerOf(homeId)], except: user.id });
  const who = person ? ` for ${person.first} ${person.last}` : "";
  await notify(to, {
    kind: "incident:reported",
    title: tier === "tier1" ? `Tier 1 event${who}: DIDD Investigations within ${settings.incident_tier1_hours} hours` : `${tier ? "Reportable event" : "Incident"} reported${who}`,
    body: [eventTypes.map(eventLabel).join(", ") || input.otherEventText, input.description.slice(0, 180)].filter(Boolean).join(". "),
    href: `/app/incidents/${row.id}`,
    tone: tier === "tier1" || severity === "critical" || severity === "high" ? "bad" : "warn",
    dedupeKey: `incident:reported:${row.id}`,
  });
  refresh(row.id);
  redirect(`/app/incidents/${row.id}`);
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
