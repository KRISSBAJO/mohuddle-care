import { Activity, Bell, Bot, Database, Mail, Server, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AutoRefresh } from "@/components/owner/AutoRefresh";
import { PageHeader, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format";
import { requireOwner } from "@/server/owner-auth";
import { healthReport, type Level } from "@/server/health";

export const metadata = { title: "Health" };
export const dynamic = "force-dynamic";

const LEVEL: Record<Level, { dot: string; word: string }> = {
  good: { dot: "bg-sage", word: "Working" },
  warn: { dot: "bg-[#d99a1e]", word: "Needs a look" },
  bad: { dot: "bg-flag", word: "Not working" },
};

const ago = (at: number | Date) => {
  const minutes = Math.round((Date.now() - (typeof at === "number" ? at : at.getTime())) / 60_000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

function Card({ title, icon: Icon, level, children }: { title: string; icon: LucideIcon; level: Level; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4 text-mute" /> {title}</h2>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-mute"><span className={cn("h-2.5 w-2.5 rounded-full", LEVEL[level].dot)} /> {LEVEL[level].word}</span>
      </div>
      <div className="mt-3 space-y-1.5 text-sm">{children}</div>
    </section>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <p className="flex justify-between gap-4"><span className="text-mute">{label}</span><span className="text-right font-medium">{children}</span></p>
);

/* Is everything Mohuddle runs on working? Checked when the page opens, and every minute after. */
export default async function HealthPage() {
  await requireOwner();
  const health = await healthReport();
  const { sweep, email, push, scribe, database, server } = health;
  return (
    <div className="space-y-8">
      <AutoRefresh seconds={60} />
      <PageHeader eyebrow="Running Mohuddle" title="Health" description={`Checked ${fmt.time(health.checkedAt)}. Refreshes every minute. Background history is kept on this server since it last started.`} />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Reminders" icon={Activity} level={sweep.level}>
          <Row label="Last run">{sweep.last ? ago(sweep.last.finishedAt) : "Not yet since the server started"}</Row>
          {sweep.last && <Row label="Took">{Math.max(1, sweep.last.finishedAt - sweep.last.startedAt)} ms</Row>}
          {sweep.last && <Row label="Reminders sent">{sweep.last.sent}, across {sweep.last.agencies} {sweep.last.agencies === 1 ? "agency" : "agencies"}</Row>}
          <Row label="Every-minute timer">{sweep.tickOn ? "On" : "Off (CRON_SECRET not set)"}</Row>
          {sweep.last?.failures.map(failure => (
            <p key={failure.at + failure.where} className="rounded-lg bg-flag-soft px-2.5 py-1.5 text-xs text-flag">{failure.where.replace("Notification sweep: ", "")}: {failure.message}</p>
          ))}
        </Card>

        <Card title="Email" icon={Mail} level={email.level}>
          <Row label="Sending">{email.sending ? "On, through RelyKit" : "Off: emails are only logged"}</Row>
          <Row label="From">{email.from}</Row>
          <Row label="Last 24 hours">{email.lastDay.sent + email.lastDay.queued} sent · {email.lastDay.failed} failed</Row>
          {email.failures.map(failure => (
            <p key={failure.at.toISOString() + failure.to} className="rounded-lg bg-flag-soft px-2.5 py-1.5 text-xs text-flag">{failure.agency}, {failure.kind} to {failure.to}, {ago(failure.at)}: {failure.detail}</p>
          ))}
        </Card>

        <Card title="Phone notifications" icon={Bell} level={push.level}>
          <Row label="Set up">{push.enabled ? "Yes" : "No (VAPID keys not set)"}</Row>
          <Row label="Devices signed up">{push.devices}</Row>
        </Card>

        <Card title="Note scribe and Ask Mohuddle" icon={Bot} level={scribe.level}>
          <Row label="Speech engine">{scribe.speechReady ? (scribe.speechRunning ? "Installed, running" : "Installed, starts when used") : "Not installed"}</Row>
          <Row label={`Note model (${scribe.noteModel})`}>{scribe.noteModelInstalled ? (scribe.noteModelLoaded ? "Loaded" : "Installed, loads when used") : "Not running"}</Row>
          {scribe.reason && <p className="text-xs text-mute">{scribe.reason}</p>}
        </Card>

        <Card title="Database" icon={Database} level={database.level}>
          <Row label="Status">{database.detail}</Row>
          {database.sizeMb !== undefined && <Row label="Size">{database.sizeMb} MB</Row>}
          {database.migrations !== undefined && <Row label="Migrations applied">{database.migrations}</Row>}
          <Row label="App connections">{database.connections.total} open · {database.connections.idle} idle · {database.connections.waiting} waiting</Row>
        </Card>

        <Card title="Server" icon={Server} level="good">
          <Row label="Up for">{server.uptimeMinutes < 60 ? `${server.uptimeMinutes} min` : `${Math.round(server.uptimeMinutes / 60)} h`}</Row>
          <Row label="Memory">{server.memoryMb} MB</Row>
          <Row label="Node">{server.node}</Row>
          <Row label="Mode">{server.environment}</Row>
          <Row label="Address">{server.appUrl}</Row>
          <Row label="Agency addresses">{server.agencyAddresses === "on" ? "On" : "Off"}</Row>
        </Card>
      </div>

      <Panel title={`Recent problems (${health.problems.length})`}>
        {health.problems.length === 0 ? (
          <p className="px-5 py-4 text-sm text-mute">Nothing has gone wrong since the server started.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {health.problems.map(problem => (
              <li key={problem.at + problem.where} className="flex gap-3 px-5 py-3 text-sm">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-flag" />
                <span className="min-w-0">
                  <span className="font-semibold">{problem.where}</span> <span className="text-xs text-mute">{ago(problem.at)}</span>
                  <span className="block break-words text-mute">{problem.message}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
