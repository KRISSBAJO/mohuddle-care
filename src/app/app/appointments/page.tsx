import Link from "next/link";
import { Plus } from "lucide-react";
import { AppointmentList } from "@/components/appointments/AppointmentParts";
import { PageHeader, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { appointmentCounts, appointmentViews, listAppointments, type AppointmentView } from "@/server/queries/appointments";
import { listHomes } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Appointments" };

type Search = { view?: string; home?: string; q?: string; book?: string };

/* Every person's appointments: what is coming up, what still needs documenting, and follow-ups to book. */
export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireUser();
  const query = await searchParams;
  const view: AppointmentView = query.view && query.view in appointmentViews ? (query.view as AppointmentView) : "upcoming";
  const homeId = query.home && /^[0-9a-f-]{36}$/.test(query.home) ? query.home : undefined;
  const [rows, counts, homes, settings, now] = await Promise.all([
    listAppointments({ view, homeId, q: query.q }),
    appointmentCounts({ homeId }),
    listHomes(),
    getSettings(),
    requestTime(),
  ]);
  const href = (next: AppointmentView) => {
    const params = new URLSearchParams();
    if (next !== "upcoming") params.set("view", next);
    if (homeId) params.set("home", homeId);
    if (query.q) params.set("q", query.q);
    const text = params.toString();
    return text ? `/app/appointments?${text}` : "/app/appointments";
  };
  const badge: Partial<Record<AppointmentView, { n: number; tone: string }>> = {
    upcoming: counts.upcoming ? { n: counts.upcoming, tone: "bg-panel text-mute" } : undefined,
    document: counts.document ? { n: counts.document, tone: "bg-accent-soft text-[#8a5a10]" } : undefined,
    followup: counts.followup ? { n: counts.followup, tone: "bg-flag-soft text-flag" } : undefined,
  };

  return (
    <>
      <PageHeader
        eyebrow="Appointments"
        title="Doctor and therapy appointments"
        description={`Book visits, choose who goes, and document what was said. Escorts are reminded ${settings.appointment_reminder_days} days before, and visits must be documented within ${settings.appointment_document_hours} hours.`}
        action={
          <Link href="/app/appointments/new" className="btn-brand"><Plus className="h-4 w-4" /> Book appointment</Link>
        }
      />
      <div className="mb-5 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <nav className="flex max-w-full gap-1 self-start overflow-x-auto rounded-xl bg-panel p-1" aria-label="Appointment views">
          {(Object.entries(appointmentViews) as [AppointmentView, string][]).map(([value, text]) => (
            <Link key={value} href={href(value)} aria-current={view === value ? "page" : undefined} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold", view === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}>
              {text}
              {badge[value] && <span className={cn("chip px-1.5 py-0", badge[value]!.tone)}>{badge[value]!.n}</span>}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-center gap-2">
          {view !== "upcoming" && <input type="hidden" name="view" value={view} />}
          <input name="q" defaultValue={query.q} placeholder="Person, type or doctor" className="field w-56 py-2" aria-label="Search appointments" />
          <select name="home" defaultValue={homeId ?? ""} className="field w-auto py-2" aria-label="Filter by home">
            <option value="">All homes</option>
            {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
          <button className="btn-ghost btn-sm">Show</button>
        </form>
      </div>
      <Panel>
        <AppointmentList
          rows={rows}
          now={now}
          documentHours={settings.appointment_document_hours}
          empty={
            view === "upcoming" ? "Nothing booked. Use Book appointment to add one." : view === "document" ? "Every past visit is documented." : view === "followup" ? "No follow-ups waiting to be booked." : "No past appointments yet."
          }
        />
      </Panel>
    </>
  );
}
