import Link from "next/link";
import { redirect } from "next/navigation";
import { OfficeClockInForm } from "@/components/clock/OfficeClockInForm";
import { PageHeader } from "@/components/app/ui";
import { clockIn } from "@/server/actions/timeclock";
import { requireUser } from "@/server/guard";
import { clockInContext, openEntry } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";
import { requestTime } from "@/server/clock";
export const metadata = { title: "Office / admin work" };
export default async function OfficeClockPage() {
  const user = await requireUser();
  if (!user.staffId) redirect("/app/clock");
  if (await openEntry(user.staffId)) redirect("/app/clock/out");
  const settings = await getSettings(), context = await clockInContext(user.staffId, await requestTime(), settings);
  const office = context.office;
  return <div className="mx-auto max-w-2xl"><Link href="/app/clock/in" className="mb-4 inline-block text-sm font-semibold text-brand">Back to clock in</Link><PageHeader eyebrow="Time clock" title="Office / admin work" description="For staff approved by an administrator." />{office.error || !office.point ? <p role="alert" className="card p-5">{office.error ?? "Office location is not configured."}</p> : <OfficeClockInForm action={clockIn} office={{ ...office, point: office.point }} statements={settings.clock_in_requirements.includes("statements") ? settings.clock_in_statements : []} />}</div>;
}
