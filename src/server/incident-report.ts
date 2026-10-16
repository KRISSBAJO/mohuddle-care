import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { zonedTime } from "@/lib/format";
import { INJURED_PARTIES, INVOLVEMENT_QUESTIONS, categoryFor, eventLabel, eventTier, isEventKey, isInterventionKey } from "@/lib/reportable-events";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { homeManagerOf, notify, recipients } from "@/server/notify";
import { getSettings } from "@/server/settings";

/*
 * Filing the state's Reportable Event Form, shared by the website's form and the phone app's
 * incident report. When a person is chosen, their details come from their record, so nothing is
 * typed twice. The tier sets how fast it must reach the state, and the team is told at once.
 */

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
export async function fileIncident(user: SessionUser, raw: unknown): Promise<{ id: string; error?: undefined } | { error: string; id?: undefined }> {
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
  return { id: row.id };
}
