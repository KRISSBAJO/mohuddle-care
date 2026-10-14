import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClockOutForm } from "@/components/clock/ClockOutForm";
import { PageHeader } from "@/components/app/ui";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { fmt } from "@/lib/format";
import { formatMinutes } from "@/lib/timeclock";
import { clockOut } from "@/server/actions/timeclock";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { clockOutContext, openEntry } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Clock out" };

export default async function ClockOutPage() {
  const user = await requireUser();
  if (!user.staffId) redirect("/app/clock");
  const [settings, now, open] = await Promise.all([getSettings(), requestTime(), openEntry(user.staffId)]);
  if (!open) redirect("/app/clock");
  const [context, [member]] = await Promise.all([
    clockOutContext(open, now, settings),
    db.select({ first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.id, user.staffId)).limit(1),
  ]);

  const summary = (
    <section className="card grid grid-cols-3 divide-x divide-line text-center">
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Clocked in</p>
        <p className="mt-1 font-display text-xl font-bold">{fmt.time(open.entry.clockInAt)}</p>
      </div>
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Shift ends</p>
        <p className="mt-1 font-display text-xl font-bold">{open.shiftEnd ? fmt.time(open.shiftEnd) : "—"}</p>
      </div>
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Worked</p>
        <p className="mt-1 font-display text-xl font-bold">{formatMinutes(context.worked)}</p>
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/clock" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> My time clock
      </Link>
      <PageHeader eyebrow="Time clock" title="Clock out" description={`Finish your shift at ${open.home ?? "work"}: hand over to the next person, then sign.`} />
      <ClockOutForm
        action={clockOut}
        home={open.home ?? "the home"}
        homePoint={{ latitude: open.homeLatitude, longitude: open.homeLongitude }}
        hasHome={Boolean(open.entry.homeId)}
        people={context.people.map(person => ({ ...person, dosesDue: person.dosesDue.map(dose => ({ id: dose.id, medication: dose.medication, scheduledFor: dose.scheduledFor.toISOString() })) }))}
        checklist={context.checklist}
        blocking={settings.clock_out_blocking}
        minChars={settings.handover_min_chars}
        overstay={context.overstay}
        needLocation={settings.clock_in_requirements.includes("location")}
        radius={settings.clock_geofence_meters}
        fullName={member ? `${member.first} ${member.last}` : ""}
        summary={summary}
      />
    </div>
  );
}
