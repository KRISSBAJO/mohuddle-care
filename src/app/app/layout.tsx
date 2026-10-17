import type { Metadata } from "next";
import { after } from "next/server";
import { AskMohuddle } from "@/components/assistant/AskMohuddle";
import { AccountMenu } from "@/components/app/AccountMenu";
import { IdleGuard } from "@/components/app/IdleGuard";
import { ZoneSync } from "@/components/app/ZoneSync";
import { NotificationBell } from "@/components/app/NotificationBell";
import { requestTime } from "@/server/clock";
import { bellFor, sweepNotifications } from "@/server/notification-sweep";
import { Sidebar } from "@/components/app/Sidebar";
import { unreadTotal } from "@/server/chat/service";
import { dateKey, fmt, zone, zoneLabel } from "@/lib/format";
import { signOut, switchAgency } from "@/server/actions/auth";
import { requireAgency } from "@/server/agency";
import { canManage, placesFor } from "@/server/auth";
import { isOwner } from "@/server/owner";
import { currentBilling } from "@/server/billing";
import { ownerConsoleUrl } from "@/server/host";
import { endSupportAction } from "@/server/actions/owner";
import { requireUser } from "@/server/guard";
import { pushPublicKey } from "@/server/push";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: { absolute: "Today | Mohuddle", template: "%s | Mohuddle" } };

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [bell, now, settings, agency, places, owner, billing] = await Promise.all([bellFor(user.id), requestTime(), getSettings(), requireAgency(), placesFor(user.loginId), isOwner(user.loginId), currentBilling()]);
  // Time-based reminders are worked out after the page is sent, so pages never wait for them.
  after(() => sweepNotifications().catch(error => console.error("Notification sweep failed", error)));
  const chatUnread = settings.chat_enabled === "on" ? await unreadTotal(user).catch(() => 0) : null;
  return (
    <div className="hub-shell flex min-h-screen flex-col lg:flex-row" data-readonly={billing?.state.mode === "read_only" && !user.supportUntil ? "" : undefined}>
      <ZoneSync zone={zone()} />
      <Sidebar user={{ name: user.name, role: user.role }} manager={canManage(user)} signOut={signOut} chatUnread={chatUnread} />
      <div className="min-w-0 flex-1">
        {billing && billing.state.mode !== "ok" && (billing.state.mode === "read_only" || canManage(user)) && !user.supportUntil && (
          <div className={`px-5 py-2.5 text-sm sm:px-8 ${billing.state.mode === "ending" ? "bg-[#fdf3d8] text-[#6b4f05]" : "bg-flag-soft text-flag"}`} role="status">
            {billing.state.mode === "ending"
              ? `Your Mohuddle ${billing.billing.status === "trial" ? "trial" : "subscription"} ends ${fmt.dayLong(billing.state.endsOn)}. Contact Mohuddle to keep everything working.`
              : billing.state.mode === "past_due"
                ? `Your Mohuddle subscription ran out on ${fmt.dayLong(billing.state.endsOn)}. Everything keeps working until ${fmt.dayLong("graceEndsOn" in billing.state ? billing.state.graceEndsOn : billing.state.endsOn)}, then Mohuddle becomes read-only. Contact Mohuddle to renew.`
                : `Mohuddle is read-only for ${agency.name}: you can see everything, but nothing can be changed until the subscription is renewed.${canManage(user) ? " Contact Mohuddle to renew." : " Your administrator has been told."}`}
          </div>
        )}
        {user.supportUntil && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#fdf3d8] px-5 py-2.5 text-sm text-[#6b4f05] sm:px-8" role="status">
            <p><span className="font-bold">Support visit to {agency.name}</span> until {fmt.time(user.supportUntil)}. The agency has been told, and everything you do is recorded.</p>
            <form action={endSupportAction}><button className="btn-ghost btn-sm border-[#b88a16]/40 bg-white/70">End visit</button></form>
          </div>
        )}
        <header className="hub-topbar">
          <div className="min-w-0"><p className="truncate text-xs font-semibold">Mohuddle <span className="mx-2 text-dim">/</span> {agency.name}</p><p className="hub-topbar-title mt-1">{fmt.dayLong(dateKey())} · {zoneLabel()}</p></div>
          <div className="hub-topbar-account">{settings.assistant_enabled === "on" && <AskMohuddle voice />}<NotificationBell unread={bell.unread} now={now} items={bell.latest.map(item => ({ id: item.id, title: item.title, body: item.body, tone: item.tone, createdAt: item.createdAt.toISOString(), read: Boolean(item.readAt) }))} pushKey={pushPublicKey} /><AccountMenu name={user.name} role={user.role} agency={agency.name} current={user.agencyId} places={places} owner={owner} ownerUrl={ownerConsoleUrl()} switchAgency={switchAgency} /></div>
        </header>
        <main className="hub-main px-5 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
      <IdleGuard idleMinutes={settings.session_idle_minutes} />
    </div>
  );
}
