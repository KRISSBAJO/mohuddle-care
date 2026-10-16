import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { age } from "@/lib/format";
import { prnSummary } from "@/lib/medicines";
import { db, schema } from "@/server/db";

/*
 * A person's key facts for the phone app: what staff on shift need at a glance. View only, and the
 * app keeps none of it once closed.
 */
export async function personFacts(id: string, now: number) {
  const [person] = await db
    .select({ person: schema.individuals, home: schema.homes.name })
    .from(schema.individuals)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(and(eq(schema.individuals.id, id), eq(schema.individuals.active, true)))
    .limit(1);
  if (!person) return null;
  const p = person.person;
  const [meds, goals, visits] = await Promise.all([
    db
      .select({ id: schema.medications.id, name: schema.medications.name, dose: schema.medications.dose, route: schema.medications.route, times: schema.medications.times, instructions: schema.medications.instructions, controlled: schema.medications.controlled, asNeeded: schema.medications.asNeeded, prnUse: schema.medications.prnUse, prnMinHours: schema.medications.prnMinHours, prnMaxPerDay: schema.medications.prnMaxPerDay })
      .from(schema.medications)
      .where(and(eq(schema.medications.individualId, id), eq(schema.medications.active, true)))
      .orderBy(asc(schema.medications.name)),
    db
      .select({ id: schema.planGoals.id, title: schema.planGoals.title, measurableStep: schema.planGoals.measurableStep })
      .from(schema.planGoals)
      .where(and(eq(schema.planGoals.individualId, id), eq(schema.planGoals.status, "active")))
      .orderBy(asc(schema.planGoals.createdAt)),
    db
      .select({ id: schema.appointments.id, type: schema.appointments.type, scheduledAt: schema.appointments.scheduledAt, clinic: schema.appointments.clinic })
      .from(schema.appointments)
      .where(and(eq(schema.appointments.individualId, id), gte(schema.appointments.scheduledAt, new Date(now))))
      .orderBy(asc(schema.appointments.scheduledAt))
      .limit(3),
  ]);
  return {
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    preferredName: p.preferredName,
    age: age(p.dob),
    pronouns: p.pronouns,
    home: person.home,
    language: p.primaryLanguage,
    communication: p.communication,
    mobility: p.mobility,
    diet: p.diet,
    likes: p.likes,
    allergies: p.allergies,
    diagnoses: p.diagnoses,
    supportNotes: p.supportNotes,
    contacts: [
      p.guardianName || p.guardianPhone ? { role: "Guardian", name: p.guardianName, phone: p.guardianPhone } : null,
      p.emergencyContact || p.emergencyPhone ? { role: "In an emergency", name: p.emergencyContact, phone: p.emergencyPhone } : null,
    ].filter(Boolean),
    medications: meds.map(med => ({ id: med.id, name: med.name, dose: med.dose, route: med.route, instructions: med.instructions, controlled: med.controlled, when: med.asNeeded ? prnSummary(med) : med.times.join(", ") })),
    goals,
    appointments: visits,
  };
}
