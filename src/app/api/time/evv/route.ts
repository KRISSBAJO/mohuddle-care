import { and, eq, gte, ilike, inArray, isNotNull, lt } from "drizzle-orm";
import { addDays, label, zonedTime } from "@/lib/format";
import { csvCell } from "@/lib/payroll";
import { currentAgency } from "@/server/agency";
import { canManage, getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";

const isDay = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const local = (at: Date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};
const verification = { ok: "Mobile GPS at the home", outside: "Mobile GPS, away from the home", unavailable: "No location (exception)", home_not_set: "Mobile GPS, home location not set", not_checked: "Not checked" } as const;

/*
 * Electronic Visit Verification data for a date range: one row per punch for each person living at
 * that home, carrying the six federal EVV items. Times are Central. For uploading to an EVV vendor.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !canManage(user)) return new Response("Only coordinators and administrators can export EVV data.", { status: 403 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!isDay(from) || !isDay(to) || to < from) return new Response("Choose a date range.", { status: 400 });

  const entries = await db
    .select({ entry: schema.timeEntries, staffFirst: schema.staff.firstName, staffLast: schema.staff.lastName, employeeNumber: schema.staff.employeeNumber, home: schema.homes.name, address: schema.homes.address, city: schema.homes.city, zip: schema.homes.zip })
    .from(schema.timeEntries)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.timeEntries.staffId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.timeEntries.homeId))
    .where(and(isNotNull(schema.timeEntries.clockOutAt), isNotNull(schema.timeEntries.homeId), gte(schema.timeEntries.clockInAt, zonedTime(from, "00:00")), lt(schema.timeEntries.clockInAt, zonedTime(addDays(to, 1), "00:00"))))
    .orderBy(schema.timeEntries.clockInAt);
  const homeIds = [...new Set(entries.map(row => row.entry.homeId!))];
  const people = homeIds.length
    ? await db
        .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, dob: schema.individuals.dob, homeId: schema.individuals.homeId, serviceType: schema.individuals.serviceType, admittedAt: schema.individuals.admittedAt, dischargedAt: schema.individuals.dischargedAt })
        .from(schema.individuals)
        .where(inArray(schema.individuals.homeId, homeIds))
    : [];
  const medicaid = people.length
    ? await db
        .select({ individualId: schema.personInsurance.individualId, memberId: schema.personInsurance.memberId })
        .from(schema.personInsurance)
        .where(and(inArray(schema.personInsurance.individualId, people.map(person => person.id)), eq(schema.personInsurance.active, true), ilike(schema.personInsurance.kind, "%medicaid%")))
    : [];

  const header = ["Service", "Member name", "Medicaid ID", "Date of birth", "Provider", "Caregiver", "Caregiver ID", "Service date", "Start time", "End time", "Hours", "Location", "Start latitude", "Start longitude", "End latitude", "End longitude", "Verification", "Exceptions"];
  const agency = await currentAgency();
  const lines = [header.map(csvCell).join(",")];
  for (const row of entries) {
    const { entry } = row;
    const start = local(entry.clockInAt);
    const end = local(entry.clockOutAt!);
    const hoursWorked = ((entry.clockOutAt!.getTime() - entry.clockInAt.getTime()) / 3_600_000).toFixed(2);
    const residents = people.filter(person => person.homeId === entry.homeId && (!person.admittedAt || person.admittedAt <= start.day) && (!person.dischargedAt || person.dischargedAt >= start.day));
    for (const person of residents) {
      lines.push(
        [
          label("serviceType", person.serviceType),
          `${person.last}, ${person.first}`,
          medicaid.find(item => item.individualId === person.id)?.memberId ?? "",
          person.dob ?? "",
          agency?.legalName ?? "",
          `${row.staffLast}, ${row.staffFirst}`,
          row.employeeNumber,
          start.day,
          start.time,
          end.time,
          hoursWorked,
          [row.address, row.city, row.zip].filter(Boolean).join(", ") || row.home || "",
          entry.inLatitude ?? "",
          entry.inLongitude ?? "",
          entry.outLatitude ?? "",
          entry.outLongitude ?? "",
          entry.inLocation === entry.outLocation ? verification[entry.inLocation] : `In: ${verification[entry.inLocation]}; out: ${verification[entry.outLocation]}`,
          entry.flags.join(" "),
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  await db.insert(schema.auditLog).values({ userId: user.id, action: "evv:export", entity: "time_entry", entityId: `${from}:${to}` });
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="evv-${from}-to-${to}.csv"`, "Cache-Control": "private, no-store" },
  });
}
