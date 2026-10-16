import { Activity, Bell, Bot, CheckCircle2, Database, Mail, RefreshCw, Server, ShieldAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AutoRefresh } from "@/components/owner/AutoRefresh";
import { OwnerCard } from "@/components/owner/OwnerCard";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format";
import { requireOwner } from "@/server/owner-auth";
import { healthReport, type Level } from "@/server/health";

export const metadata = { title: "Health" };
export const dynamic = "force-dynamic";

const LEVEL: Record<Level, { dot: string; word: string; chip: string; edge: string }> = {
  good: { dot: "bg-sage", word: "Working", chip: "bg-sage-soft text-sage", edge: "before:bg-sage" },
  warn: { dot: "bg-[#d99a1e]", word: "Needs a look", chip: "bg-accent-soft text-[#8a5a10]", edge: "before:bg-[#d99a1e]" },
  bad: { dot: "bg-flag", word: "Not working", chip: "bg-flag-soft text-flag", edge: "before:bg-flag" },
};

const ago = (at: number | Date, now: number) => {
  const minutes = Math.round((now - (typeof at === "number" ? at : at.getTime())) / 60_000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

function Service({ title, icon: Icon, level, children, footer }: { title: string; icon: LucideIcon; level: Level; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className={cn("card relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-1", LEVEL[level].edge)}>
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h2 className="flex items-center gap-2.5 text-sm font-bold">
          <span className={cn("grid h-9 w-9 place-items-center rounded-xl", LEVEL[level].chip)}><Icon className="h-4 w-4" /></span> {title}
        </h2>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", LEVEL[level].chip)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", LEVEL[level].dot)} /> {LEVEL[level].word}
        </span>
      </div>
      <dl className="divide-y divide-line/60 px-5 pb-2 text-sm">{children}</dl>
      {footer && <div className="space-y-2 px-5 pb-5">{footer}</div>}
    </section>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2">
    <dt className="text-mute">{label}</dt>
    <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
  </div>
);

const Failure = ({ children }: { children: React.ReactNode }) => <p className="rounded-lg bg-flag-soft px-3 py-2 text-xs text-flag">{children}</p>;

/* Is everything Mohuddle runs on working? Checked when the page opens, and every minute after. */
export default async function HealthPage() {
  await requireOwner();
  const health = await healthReport();
  const now = health.checkedAt.getTime();
  const { sweep, email, push, scribe, database, server } = health;
  const services: { name: string; level: Level }[] = [
    { name: "Reminders", level: sweep.level },
    { name: "Email", level: email.level },
    { name: "Phone notifications", level: push.level },
    { name: "Note scribe", level: scribe.level },
    { name: "Database", level: database.level },
    { name: "Server", level: "good" },
  ];
  const bad = services.filter(item => item.level === "bad").length;
  const warn = services.filter(item => item.level === "warn").length;
  const overall: Level = bad ? "bad" : warn ? "warn" : "good";
  const headline = bad ? `${bad} ${bad === 1 ? "thing is" : "things are"} not working` : warn ? `${warn} ${warn === 1 ? "thing needs" : "things need"} a look` : "Everything is working";
  // The last runs of the reminder sweep, oldest first, for the bars.
  const runs = [...sweep.recent].reverse();
  const slowest = Math.max(1, ...runs.map(run => run.finishedAt - run.startedAt));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#153a32] via-[#1b4a3e] to-[#286b55] text-white shadow-[0_24px_60px_-30px_#0e2a24]">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#dcef98]/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <span className="relative grid h-16 w-16 shrink-0 place-items-center">
              {overall === "good" && <span className="absolute inset-0 animate-ping rounded-full bg-[#dcef98]/25 motion-reduce:animate-none" aria-hidden="true" />}
              <span className={cn("relative grid h-14 w-14 place-items-center rounded-full", overall === "good" ? "bg-[#dcef98] text-[#173e35]" : overall === "warn" ? "bg-[#f3c766] text-[#5a3b06]" : "bg-[#f19b8f] text-[#5b1209]")}>
                {overall === "good" ? <CheckCircle2 className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
              </span>
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Running Mohuddle</p>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{headline}</h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/65"><RefreshCw className="h-3.5 w-3.5" /> Checked {fmt.time(health.checkedAt)}. Refreshes every minute.</p>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            {services.map(item => (
              <li key={item.name} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
                <span className={cn("h-2 w-2 rounded-full", item.level === "good" ? "bg-[#dcef98]" : item.level === "warn" ? "bg-[#f3c766]" : "bg-[#f19b8f]")} /> {item.name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Service
          title="Reminders"
          icon={Activity}
          level={sweep.level}
          footer={
            <>
              {runs.length > 1 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute">Last {runs.length} runs</p>
                  <div className="flex h-10 items-end gap-1">
                    {runs.map(run => (
                      <span
                        key={run.startedAt}
                        title={`${fmt.time(new Date(run.finishedAt))}: ${run.finishedAt - run.startedAt} ms, ${run.sent} sent`}
                        className={cn("flex-1 rounded-sm", run.failures.length ? "bg-flag" : "bg-sage/70")}
                        style={{ height: `${Math.max(12, ((run.finishedAt - run.startedAt) / slowest) * 100)}%` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {sweep.last?.failures.map(failure => (
                <Failure key={failure.at + failure.where}>{failure.where.replace("Notification sweep: ", "")}: {failure.message}</Failure>
              ))}
            </>
          }
        >
          <Row label="Last run">{sweep.last ? ago(sweep.last.finishedAt, now) : "Not yet since the server started"}</Row>
          {sweep.last && <Row label="Took">{Math.max(1, sweep.last.finishedAt - sweep.last.startedAt)} ms</Row>}
          {sweep.last && <Row label="Reminders sent">{sweep.last.sent}, across {sweep.last.agencies} {sweep.last.agencies === 1 ? "agency" : "agencies"}</Row>}
          <Row label="Every-minute timer">{sweep.tickOn ? "On" : "Off (CRON_SECRET not set)"}</Row>
        </Service>

        <Service
          title="Email"
          icon={Mail}
          level={email.level}
          footer={email.failures.map(failure => (
            <Failure key={failure.at.toISOString() + failure.to}>{failure.agency}, {failure.kind} to {failure.to}, {ago(failure.at, now)}: {failure.detail}</Failure>
          ))}
        >
          <Row label="Sending">{email.sending ? "On, through RelyKit" : "Off: emails are only logged"}</Row>
          <Row label="From">{email.from}</Row>
          <Row label="Last 24 hours">
            <span className="tabular-nums">{email.lastDay.sent + email.lastDay.queued} sent</span> · <span className={cn("tabular-nums", email.lastDay.failed && "text-flag")}>{email.lastDay.failed} failed</span>
          </Row>
        </Service>

        <Service title="Phone notifications" icon={Bell} level={push.level}>
          <Row label="Set up">{push.enabled ? "Yes" : "No (VAPID keys not set)"}</Row>
          <Row label="Devices signed up">{push.devices}</Row>
        </Service>

        <Service title="Note scribe and Ask Mohuddle" icon={Bot} level={scribe.level} footer={scribe.reason && <p className="text-xs text-mute">{scribe.reason}</p>}>
          <Row label="Speech engine">{scribe.speechReady ? (scribe.speechRunning ? "Installed, running" : "Installed, starts when used") : "Not installed"}</Row>
          <Row label="Note model">{scribe.noteModelInstalled ? (scribe.noteModelLoaded ? "Loaded" : "Installed, loads when used") : "Not running"}</Row>
          <Row label="Model name"><span className="font-mono text-xs">{scribe.noteModel}</span></Row>
        </Service>

        <Service title="Database" icon={Database} level={database.level}>
          <Row label="Status">{database.detail}</Row>
          {database.sizeMb !== undefined && <Row label="Size">{database.sizeMb} MB</Row>}
          {database.migrations !== undefined && <Row label="Migrations applied">{database.migrations}</Row>}
          <Row label="App connections">{database.connections.total} open · {database.connections.idle} idle · {database.connections.waiting} waiting</Row>
        </Service>

        <Service title="Server" icon={Server} level="good">
          <Row label="Up for">{server.uptimeMinutes < 60 ? `${server.uptimeMinutes} min` : `${Math.round(server.uptimeMinutes / 60)} h`}</Row>
          <Row label="Memory">{server.memoryMb} MB</Row>
          <Row label="Node">{server.node}</Row>
          <Row label="Mode">{server.environment}</Row>
          <Row label="Address">{server.appUrl}</Row>
          <Row label="Agency addresses">{server.agencyAddresses === "on" ? "On" : "Off"}</Row>
        </Service>
      </div>

      <OwnerCard title={`Recent problems (${health.problems.length})`} icon={TriangleAlert} action={<span className="text-xs text-mute">Kept since the server last started</span>}>
        {health.problems.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sage-soft text-sage"><CheckCircle2 className="h-7 w-7" /></span>
            <p className="mt-3 font-semibold">No problems</p>
            <p className="text-sm text-mute">Nothing has gone wrong since the server started.</p>
          </div>
        ) : (
          <ol className="relative space-y-4 px-5 py-5 before:absolute before:bottom-5 before:left-[27px] before:top-5 before:w-px before:bg-line">
            {health.problems.map(problem => (
              <li key={problem.at + problem.where} className="relative flex gap-3 text-sm">
                <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-flag ring-2 ring-flag-soft" />
                <span className="min-w-0">
                  <span className="font-semibold">{problem.where}</span> <span className="text-xs text-mute">{ago(problem.at, now)}</span>
                  <span className="mt-0.5 block break-words font-mono text-xs text-mute">{problem.message}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </OwnerCard>
    </div>
  );
}
