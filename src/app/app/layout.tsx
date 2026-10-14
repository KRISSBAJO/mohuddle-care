import type { Metadata } from "next";
import { Sidebar } from "@/components/app/Sidebar";
import { fmt, dateKey } from "@/lib/format";
import { signOut } from "@/server/actions/auth";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";

export const metadata: Metadata = { title: { default: "Hub", template: "%s | Milestone Hub" } };

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="hub-shell flex min-h-screen flex-col lg:flex-row">
      <Sidebar user={{ name: user.name, role: user.role }} manager={canManage(user)} signOut={signOut} />
      <div className="min-w-0 flex-1">
        <header className="hub-topbar">
          <div><p className="text-xs font-semibold">Milestone Hub <span className="mx-2 text-dim">/</span> Care workspace</p><p className="hub-topbar-title mt-1">{fmt.dayLong(dateKey())} · Central time</p></div>
          <div className="hub-topbar-account"><div className="text-right"><p className="text-xs font-semibold">{user.name}</p><p className="mt-1 text-[10px] capitalize text-mute">{user.role}</p></div><span className="hub-topbar-avatar">{user.name.split(" ").map(n => n[0]).slice(0, 2).join("")}</span></div>
        </header>
        <main className="hub-main px-5 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
