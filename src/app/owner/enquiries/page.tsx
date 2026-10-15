import { Mail, Phone } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { fmt } from "@/lib/format";
import { markEnquiryAction } from "@/server/actions/owner";
import { requireOwner } from "@/server/guard";
import { productEnquiries } from "@/server/owner";

export const metadata = { title: "Demo requests" };

/* Requests for a Mohuddle demo from the product page, newest first, handled ones last. */
export default async function DemoRequestsPage() {
  await requireOwner();
  const requests = await productEnquiries();
  const open = requests.filter(request => !request.handled).length;
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Owner console" title="Demo requests" description="Agencies asking to see Mohuddle, from the form on the Mohuddle page. Mark each one handled once you have replied." />
      <Panel title={`${open} waiting`}>
        {requests.length === 0 ? (
          <Empty>No demo requests yet.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {requests.map(request => (
              <li key={request.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {request.name}
                    {request.agencyName && <span className="font-normal text-mute">· {request.agencyName}</span>}
                    {request.handled ? <Badge tone="neutral">Handled</Badge> : <Badge tone="warn">Waiting</Badge>}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                    <a href={`mailto:${request.email}`} className="inline-flex items-center gap-1 hover:text-ink"><Mail className="h-3.5 w-3.5" /> {request.email}</a>
                    {request.phone && <a href={`tel:${request.phone}`} className="inline-flex items-center gap-1 hover:text-ink"><Phone className="h-3.5 w-3.5" /> {request.phone}</a>}
                    <span>{fmt.dateTime(request.createdAt)}</span>
                  </p>
                  {request.message && <p className="mt-2 whitespace-pre-line text-ink/80">{request.message}</p>}
                </div>
                <ConfirmAction action={markEnquiryAction.bind(null, request.id, !request.handled)} label={request.handled ? "Mark waiting" : "Mark handled"} tone={request.handled ? "ghost" : "brand"} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
