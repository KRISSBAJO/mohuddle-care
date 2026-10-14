import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClockInForm } from "@/components/clock/ClockInForm";
import { PageHeader } from "@/components/app/ui";
import { clockIn } from "@/server/actions/timeclock";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { clockInContext, openEntry } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Clock in" };

const asShift = (shift: { id: string; homeId: string; home: string; pattern: string | null; startsAt: Date; endsAt: Date } | null) =>
  shift ? { id: shift.id, homeId: shift.homeId, home: shift.home, pattern: shift.pattern, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() } : null;

export default async function ClockInPage() {
  const user = await requireUser();
  if (!user.staffId) redirect("/app/clock");
  const [settings, now] = await Promise.all([getSettings(), requestTime()]);
  if (await openEntry(user.staffId)) redirect("/app/clock");
  const context = await clockInContext(user.staffId, now, settings);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/clock" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> My time clock
      </Link>
      <PageHeader eyebrow="Time clock" title="Clock in" description="Your time starts when you press Clock in." />
      <ClockInForm
        action={clockIn}
        shift={asShift(context.shift)}
        upcoming={asShift(context.upcoming)}
        earlyMinutes={settings.clock_early_minutes}
        homes={context.homes}
        handovers={context.handovers.map(item => ({ ...item, createdAt: item.createdAt.toISOString() }))}
        statements={settings.clock_in_statements}
        requirements={settings.clock_in_requirements}
        radius={settings.clock_geofence_meters}
      />
    </div>
  );
}
