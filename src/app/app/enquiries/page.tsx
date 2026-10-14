import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { fmt } from "@/lib/format";
import { markEnquiryHandled } from "@/server/actions/hub";
import { requireManager } from "@/server/guard";
import { listEnquiries } from "@/server/queries/hub";

export const metadata = { title: "Website messages" };
const kindLabel: Record<string, string> = { contact: "Enquiry", referral: "Referral", careers: "Job interest", foster: "Foster interest", demo: "Mohuddle demo" };

export default async function EnquiriesPage() {
  await requireManager();
  const rows = await listEnquiries();
  const open = rows.filter(row => !row.handled).length;
  return (
    <>
      <PageHeader eyebrow="Website messages" title={`${open} waiting for a reply`} description="Messages sent through the public website's forms. Mark each one handled once someone has replied." />
      <Panel>
        {rows.length === 0 ? <Empty>No messages yet.</Empty> : (
          <ul className="divide-y divide-line/60">
            {rows.map(row => (
              <li key={row.id} className={`px-5 py-4 ${row.handled ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{row.name}</p>
                  <Badge tone={row.kind === "careers" || row.kind === "foster" ? "plum" : "brand"}>{kindLabel[row.kind] ?? row.kind}</Badge>
                  {row.interest && <span className="text-xs text-mute">{row.interest}</span>}
                  <span className="ml-auto text-xs text-dim">{fmt.dateTime(row.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-mute"><a href={`mailto:${row.email}`} className="text-brand">{row.email}</a>{row.phone && <> · <a href={`tel:${row.phone}`} className="text-brand">{row.phone}</a></>}</p>
                {row.message && <p className="mt-2 whitespace-pre-line text-sm">{row.message}</p>}
                <form action={markEnquiryHandled.bind(null, row.id, !row.handled)} className="mt-2">
                  <button className="text-xs font-semibold text-brand">{row.handled ? "Mark as waiting" : "Mark handled"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
