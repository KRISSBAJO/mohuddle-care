import Link from "next/link";
import { Empty, PageHeader, Panel } from "@/components/app/ui";
import { fmt } from "@/lib/format";
import { ownerActionWords } from "@/lib/owner-events";
import { requireOwner } from "@/server/guard";
import { ownerEvents } from "@/server/owner";

export const metadata = { title: "Activity" };

/* Everything owners have done in the console, newest first. */
export default async function ActivityPage() {
  await requireOwner();
  const events = await ownerEvents();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Owner console" title="Activity" description="Who did what in the owner console, and when. Agencies cannot see this. The latest 300." />
      <Panel title={`${events.length} ${events.length === 1 ? "entry" : "entries"}`}>
        {events.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-mute">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-3 py-3 font-semibold">Who</th>
                  <th className="px-3 py-3 font-semibold">What</th>
                  <th className="px-3 py-3 font-semibold">Agency</th>
                  <th className="px-5 py-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => (
                  <tr key={event.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-mute">{fmt.dateTime(event.at)}</td>
                    <td className="px-3 py-3">{event.ownerName}</td>
                    <td className="px-3 py-3 font-semibold">{ownerActionWords(event.action)}</td>
                    <td className="px-3 py-3">{event.agencyId && event.agency ? <Link href={`/owner/agencies/${event.agencyId}`} className="hover:text-brand">{event.agency}</Link> : <span className="text-mute">—</span>}</td>
                    <td className="px-5 py-3 text-mute">{event.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
