import { and, eq, inArray } from "drizzle-orm";
import { CheckCircle2, FolderLock } from "lucide-react";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { RequestChecklist } from "@/components/docs/RequestChecklist";
import { appliesToRole, REQUIREMENT_STATE, requirementState } from "@/lib/documents";
import { dateKey, fmt } from "@/lib/format";
import { db, schema } from "@/server/db";
import { openRequestsFor } from "@/server/docs/requests";
import { env } from "@/server/env";
import { requireUser } from "@/server/guard";
import { documentTypes } from "@/server/queries/documents";

export const metadata = { title: "My documents" };

/*
 * A staff member's own page: what the agency has asked them for, with a way to send or sign each one,
 * and the state of their file. They see dates and status, not the stored files themselves.
 */
export default async function MyDocumentsPage() {
  const user = await requireUser();
  if (!user.staffId) {
    return (
      <>
        <PageHeader eyebrow="My documents" title="My documents" />
        <Panel><Empty>Your login is not linked to a staff record, so there is no staff file to show.</Empty></Panel>
      </>
    );
  }
  const [member] = await db.select().from(schema.staff).where(eq(schema.staff.id, user.staffId)).limit(1);
  const [requests, types, docs] = await Promise.all([
    openRequestsFor(user.staffId),
    documentTypes("staff"),
    db.select({ typeId: schema.documents.typeId, status: schema.documents.status, expiresOn: schema.documents.expiresOn }).from(schema.documents).where(and(eq(schema.documents.staffId, user.staffId), inArray(schema.documents.status, ["submitted", "approved", "rejected"]))),
  ]);
  const today = dateKey();
  const required = types.filter(type => type.required && appliesToRole(type.roles, member?.role ?? "dsp"));
  const openTypes = new Set(requests.flatMap(entry => entry.items.filter(item => item.status === "pending" || item.status === "rejected").map(item => item.typeId)));
  const rows = required.map(type => {
    const mine = docs.filter(doc => doc.typeId === type.id);
    const current = mine.find(doc => doc.status === "approved");
    return { type, state: requirementState(mine, today, type.reminderDays, openTypes.has(type.id)), expiresOn: current?.expiresOn ?? null };
  });
  const toDo = requests.reduce((sum, entry) => sum + entry.items.filter(item => item.status === "pending" || item.status === "rejected").length, 0);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        eyebrow="My documents"
        title="My documents"
        description={toDo ? `${toDo} ${toDo === 1 ? "document is" : "documents are"} waiting for you. Upload or sign them here; your coordinator is told when they arrive.` : "Nothing is waiting for you right now."}
      />
      {requests.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-sage" />
            <p className="mt-3 font-semibold">You are all caught up.</p>
          </div>
        </Panel>
      ) : (
        requests.map(({ request, items }) => (
          <section key={request.id}>
            <h2 className="text-lg font-bold">{request.title}</h2>
            <p className="mb-3 text-sm text-mute">
              Sent {fmt.day(request.createdAt)}{request.dueOn ? ` · needed by ${fmt.dayLong(request.dueOn)}` : ""}
              {request.message ? ` · “${request.message}”` : ""}
            </p>
            <RequestChecklist items={items} token={null} signHref={itemId => `/app/my-documents/sign/${itemId}`} maxMb={env.MAX_UPLOAD_MB} />
          </section>
        ))
      )}
      <Panel title="My staff file">
        {rows.length === 0 ? (
          <Empty>No documents are required for your role.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map(row => (
              <li key={row.type.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <FolderLock className="h-4 w-4 text-dim" />
                <span className="min-w-0 flex-1 font-medium">{row.type.name}</span>
                {row.expiresOn && <span className={row.expiresOn < today ? "text-xs font-semibold text-flag" : "text-xs text-mute"}>Expires {fmt.dayLong(row.expiresOn)}</span>}
                <Badge tone={REQUIREMENT_STATE[row.state].tone}>{REQUIREMENT_STATE[row.state].text}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-5 py-2.5 text-xs text-mute">For your privacy, files are kept by the office and are not shown here. Ask your coordinator if you need a copy.</p>
      </Panel>
    </div>
  );
}
