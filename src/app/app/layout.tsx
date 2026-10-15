import type { Metadata } from "next";
import { after } from "next/server";
import { AskMohuddle } from "@/components/assistant/AskMohuddle";
import { IdleGuard } from "@/components/app/IdleGuard";
import { NotificationBell } from "@/components/app/NotificationBell";
import { requestTime } from "@/server/clock";
import { bellFor, sweepNotifications } from "@/server/notification-sweep";
import { Sidebar } from "@/components/app/Sidebar";
import { fmt, dateKey } from "@/lib/format";
import { signOut } from "@/server/actions/auth";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { pushPublicKey } from "@/server/push";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: { absolute: "Today | Mohuddle", template: "%s | Mohuddle" } };

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [bell, now, settings] = await Promise.all([bellFor(user.id), requestTime(), getSettings()]);
  // Time-based reminders are worked out after the page is sent, so pages never wait for them.
  after(() => sweepNotifications().catch(error => console.error("Notification sweep failed", error)));
  return (
    <div className="hub-shell flex min-h-screen flex-col lg:flex-row">
      <Sidebar user={{ name: user.name, role: user.role }} manager={canManage(user)} signOut={signOut} />
      <div className="min-w-0 flex-1">
        <header className="hub-topbar">
          <div><p className="text-xs font-semibold">Mohuddle <span className="mx-2 text-dim">/</span> Care workspace</p><p className="hub-topbar-title mt-1">{fmt.dayLong(dateKey())} · Central time</p></div>
          <div className="hub-topbar-account">{settings.assistant_enabled === "on" && <AskMohuddle voice />}<NotificationBell unread={bell.unread} now={now} items={bell.latest.map(item => ({ id: item.id, title: item.title, body: item.body, tone: item.tone, createdAt: item.createdAt.toISOString(), read: Boolean(item.readAt) }))} pushKey={pushPublicKey} /><div className="text-right"><p className="text-xs font-semibold">{user.name}</p><p className="mt-1 text-[10px] capitalize text-mute">{user.role}</p></div><span className="hub-topbar-avatar">{user.name.split(" ").map(n => n[0]).slice(0, 2).join("")}</span></div>
        </header>
        <main className="hub-main px-5 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
      <IdleGuard idleMinutes={settings.session_idle_minutes} />
    </div>
  );
}
