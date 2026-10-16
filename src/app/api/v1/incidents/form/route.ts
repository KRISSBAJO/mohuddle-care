import { asc, eq } from "drizzle-orm";
import { EVENT_GROUPS } from "@/lib/reportable-events";
import { requestTime } from "@/server/clock";
import { db, schema } from "@/server/db";
import { phoneRoute, reply } from "@/server/mobile/api";
import { clockInContext, openEntry } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/* What the phone's incident report offers: the people (those at your home first) and the event types. */
export const GET = phoneRoute(async user => {
  let homeId: string | null = null;
  if (user.staffId) {
    const open = await openEntry(user.staffId);
    homeId = open?.entry.homeId ?? (await clockInContext(user.staffId, await requestTime(), await getSettings())).shift?.homeId ?? null;
  }
  const people = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, homeId: schema.individuals.homeId, home: schema.homes.name })
    .from(schema.individuals)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(eq(schema.individuals.active, true))
    .orderBy(asc(schema.individuals.firstName));
  return reply({
    homeId,
    people: people.map(person => ({ id: person.id, name: `${person.first} ${person.last}`, homeId: person.homeId, home: person.home })),
    groups: EVENT_GROUPS.map(group => ({ key: group.key, title: group.title, deadline: group.deadline, events: group.events })),
  });
});
