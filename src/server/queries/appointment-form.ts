import "server-only";
import { asc, eq } from "drizzle-orm";
import { labels } from "@/lib/format";
import type { CareContact } from "@/components/appointments/AppointmentForm";
import { db, schema } from "@/server/db";
import { listIndividuals, listStaff } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

/* Everything the appointment form offers: types, staff, people and each person's care team. */
export async function appointmentFormData() {
  const [settings, staff, people, contacts] = await Promise.all([
    getSettings(),
    listStaff(),
    listIndividuals(),
    db
      .select({ id: schema.personContacts.id, individualId: schema.personContacts.individualId, role: schema.personContacts.role, name: schema.personContacts.name, organization: schema.personContacts.organization, phone: schema.personContacts.phone, address: schema.personContacts.address })
      .from(schema.personContacts)
      .innerJoin(schema.individuals, eq(schema.individuals.id, schema.personContacts.individualId))
      .where(eq(schema.individuals.active, true))
      .orderBy(asc(schema.personContacts.role)),
  ]);
  const byPerson: Record<string, CareContact[]> = {};
  for (const { individualId, ...contact } of contacts) (byPerson[individualId] ??= []).push(contact);
  return {
    types: settings.appointment_types,
    staff: staff.map(member => ({ value: member.id, label: `${member.firstName} ${member.lastName}`, hint: labels.staffRole[member.role as keyof typeof labels.staffRole] })),
    people: people.map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}`, hint: person.home ?? undefined })),
    contacts: byPerson,
  };
}
