import "server-only";
import { and, asc, eq, ilike } from "drizzle-orm";
import { age } from "@/lib/format";
import { currentAgency } from "@/server/agency";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";

export type PersonFacts = {
  id: string;
  name: string;
  dob: string | null;
  age: number | null;
  gender: string;
  alias: string;
  waiverType: string;
  medicaidId: string;
  mco: string;
  hasGuardian: boolean;
  guardian: string;
  homeId: string | null;
  home: string;
  address: string;
  city: string;
  zip: string;
  region: string;
};

/*
 * Everything the Reportable Event Form can fill in for itself: each person's details from their
 * record, insurance and home, the staff who could have witnessed it, and the agency's lists.
 */
export async function incidentFormData() {
  const [people, medicaid, homes, staff, settings] = await Promise.all([
    db
      .select({ person: schema.individuals, home: schema.homes })
      .from(schema.individuals)
      .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
      .where(eq(schema.individuals.active, true))
      .orderBy(asc(schema.individuals.firstName), asc(schema.individuals.lastName)),
    db
      .select({ individualId: schema.personInsurance.individualId, memberId: schema.personInsurance.memberId, payer: schema.personInsurance.payer, plan: schema.personInsurance.plan })
      .from(schema.personInsurance)
      .where(and(eq(schema.personInsurance.active, true), ilike(schema.personInsurance.kind, "%medicaid%"))),
    db.select({ id: schema.homes.id, name: schema.homes.name, address: schema.homes.address, city: schema.homes.city, zip: schema.homes.zip, region: schema.homes.region }).from(schema.homes).where(eq(schema.homes.active, true)).orderBy(asc(schema.homes.name)),
    db.select({ id: schema.staff.id, first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.active, true)).orderBy(asc(schema.staff.firstName)),
    getSettings(),
  ]);

  // The health plan named on their Medicaid cover, matched to the agency's list where it can be.
  const mcoFor = (payer: string, plan: string) => settings.mco_options.find(option => `${payer} ${plan}`.toLowerCase().includes(option.toLowerCase().split(" ")[0])) ?? payer;

  const facts: PersonFacts[] = people.map(({ person, home }) => {
    const cover = medicaid.find(row => row.individualId === person.id);
    return {
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
      dob: person.dob,
      age: age(person.dob),
      gender: person.gender,
      alias: person.preferredName,
      waiverType: person.waiverType,
      medicaidId: cover?.memberId ?? "",
      mco: cover ? mcoFor(cover.payer, cover.plan) : "",
      hasGuardian: Boolean(person.guardianName),
      guardian: person.guardianName,
      homeId: person.homeId,
      home: home?.name ?? "",
      address: home?.address ?? "",
      city: home?.city ?? "",
      zip: home?.zip ?? "",
      region: home?.region ?? "",
    };
  });

  return {
    people: facts,
    homes,
    staff: staff.map(member => ({ value: member.id, label: `${member.first} ${member.last}` })),
    lists: {
      parties: settings.incident_notify_parties,
      locations: settings.incident_locations,
      waivers: settings.waiver_types,
      mcos: settings.mco_options,
    },
    provider: (await currentAgency())?.legalName ?? "",
    tier1Hours: settings.incident_tier1_hours,
    fileHours: settings.incident_report_hours,
  };
}

export type IncidentFormData = Awaited<ReturnType<typeof incidentFormData>>;
