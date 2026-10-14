import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Bell, CalendarClock, ClipboardCheck, ShieldAlert, Stethoscope } from "lucide-react";
import { Empty, PageHeader, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format";
import { markAllRead } from "@/server/actions/notifications";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";

export const metadata = { title: "Notifications" };

const icon = (kind: string) => (kind.startsWith("appointment") ? Stethoscope : kind.startsWith("notes") ? ClipboardCheck : kind.startsWith("incident") ? ShieldAlert : kind.startsWith("task") ? CalendarClock : Bell);
const tone = { info: "bg-sky text-brand-deep", warn: "bg-accent-soft text-[#8a5a10]", bad: "bg-flag-soft text-flag", good: "bg-sage-soft text-sage" } as const;

/* Everything the Hub has told this person: reminders, deadlines and changes, newest first. */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser();
  const { show } = await searchParams;
  const unreadOnly = show === "unread";
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), unreadOnly ? isNull(schema.notifications.readAt) : undefined))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(150);
  const unread = rows.filter(row => !row.readAt).length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Notifications"
        title="Your notifications"
        description="Reminders about appointments you are going to, notes you owe, visits to document, follow-ups to book and filing deadlines. Who gets which is set in Settings."
        action={
          unread > 0 ? (
            <form action={markAllRead}>
              <button className="btn-ghost btn-sm">Mark all read</button>
            </form>
          ) : undefined
        }
      />
      <div className="mb-4 flex gap-2">
        <Link href="/app/notifications" className={cn("chip", !unreadOnly ? "bg-ink text-white" : "bg-panel text-mute")}>All</Link>
        <Link href="/app/notifications?show=unread" className={cn("chip", unreadOnly ? "bg-ink text-white" : "bg-panel text-mute")}>Unread</Link>
      </div>
      <Panel>
        {rows.length === 0 ? (
          <Empty>{unreadOnly ? "You are all caught up." : "Nothing yet."}</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map(row => {
              const Icon = icon(row.kind);
              return (
                <li key={row.id}>
                  <a href={`/app/notifications/open/${row.id}`} className={cn("flex gap-4 px-5 py-4 hover:bg-panel/50", !row.readAt && "bg-sky/20")}>
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tone[row.tone])}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", !row.readAt && "font-semibold")}>{row.title}</span>
                      {row.body && <span className="block text-sm text-mute">{row.body}</span>}
                      <span className="mt-0.5 block text-xs text-dim">{fmt.dateTime(row.createdAt)}{row.readAt ? "" : " · new"}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
