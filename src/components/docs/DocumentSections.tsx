import { and, eq } from "drizzle-orm";
import { FileSignature, FolderOpen } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { appliesToRole, requirementState } from "@/lib/documents";
import { dateKey, fmt } from "@/lib/format";
import { freshRequestLink, requestStaffDocuments, withdrawRequest } from "@/server/actions/documents";
import { requestPersonDocuments } from "@/server/actions/signing";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { documentTypes, ownerDocuments, requestsFor } from "@/server/queries/documents";
import { OwnerDocuments } from "./OwnerDocuments";
import { PersonRequestForm } from "./PersonRequestForm";
import { RequestDocumentsForm } from "./RequestDocumentsForm";
import { FreshLinkButton } from "./ShareLink";

type Requests = Awaited<ReturnType<typeof requestsFor>>;

function RequestHistory({ rows, now }: { rows: Requests; now: number }) {
  if (!rows.length) return null;
  return (
    <Panel title="Requests sent">
      <ul className="divide-y divide-line/60">
        {rows.map(({ request, items }) => {
          const open = !request.revokedAt && !request.completedAt;
          const linkState = request.revokedAt ? "Withdrawn" : request.completedAt ? "Complete" : request.expiresAt.getTime() < now ? "Link expired" : `Link works until ${fmt.dateTime(request.expiresAt)}`;
          return (
            <li key={request.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm">
                  <span className="font-semibold">{request.title}</span>
                  {request.recipientName && <span className="text-mute"> · to {request.recipientName}{request.recipientRelation ? ` (${request.recipientRelation})` : ""}</span>}
                  <span className="block text-xs text-mute">
                    Sent {fmt.day(request.createdAt)} · {items.filter(item => item.status === "approved").length} of {items.length} done · {linkState}
                    {request.lastOpenedAt ? ` · opened ${fmt.dateTime(request.lastOpenedAt)}` : " · not opened yet"}
                  </span>
                </p>
                {open && (
                  <div className="flex flex-wrap items-start gap-2">
                    <FreshLinkButton action={freshRequestLink.bind(null, request.id)} />
                    <ConfirmAction action={withdrawRequest.bind(null, request.id)} label="Withdraw" confirm="Withdraw this request? The link stops working." />
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {items.map(item => (
                  <span key={item.id} className={cn("chip px-2 py-0.5 text-[11px]", item.status === "approved" ? "bg-sage-soft text-sage" : item.status === "submitted" ? "bg-sky text-brand-deep" : item.status === "rejected" ? "bg-flag-soft text-flag" : "bg-panel text-mute")}>
                    {item.kind === "sign" && <FileSignature className="h-3 w-3" />} {item.label}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* A staff member's file: every required document, their state, requests sent, and a way to ask for more. */
export async function StaffDocumentsSection({ staffId, now }: { staffId: string; now: number }) {
  const [member] = await db.select().from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1);
  if (!member) return null;
  const [types, docs, requests, templates] = await Promise.all([
    documentTypes("staff"),
    ownerDocuments({ kind: "staff", id: staffId }),
    requestsFor({ staffId }),
    db.select({ id: schema.signTemplates.id, title: schema.signTemplates.title }).from(schema.signTemplates).where(and(eq(schema.signTemplates.active, true), eq(schema.signTemplates.category, "staff"))),
  ]);
  const applicable = types.filter(type => appliesToRole(type.roles, member.role));
  const openItems = requests.filter(row => !row.request.revokedAt).flatMap(row => row.items.filter(item => item.status === "pending" || item.status === "rejected"));
  const today = dateKey();
  const options = applicable.map(type => ({
    id: type.id,
    name: type.name,
    required: type.required,
    state: requirementState(docs.filter(doc => doc.typeId === type.id && ["submitted", "approved", "rejected"].includes(doc.status)), today, type.reminderDays, openItems.some(item => item.typeId === type.id)),
  }));
  return (
    <section id="documents" className="scroll-mt-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><FolderOpen className="h-5 w-5 text-brand" /> Staff file</h2>
          <p className="text-sm text-mute">Hiring paperwork, checks, certificates and signed agreements for {member.firstName}.</p>
        </div>
        {member.active && <RequestDocumentsForm action={requestStaffDocuments.bind(null, staffId)} types={options} templates={templates} first={member.firstName} />}
      </div>
      <OwnerDocuments owner={{ kind: "staff", id: staffId }} types={applicable} docs={docs} openItems={openItems} manager maxMb={env.MAX_UPLOAD_MB} canOpen title="Required and optional documents" />
      <RequestHistory rows={requests} now={now} />
    </section>
  );
}

/* A person's documents: ISP, insurance cards, consents. Coordinators can ask a guardian to sign or send. */
export async function PersonDocumentsSection({ individualId, manager, now }: { individualId: string; manager: boolean; now: number }) {
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, individualId)).limit(1);
  if (!person) return null;
  const [types, docs, requests, templates] = await Promise.all([
    documentTypes("person"),
    ownerDocuments({ kind: "person", id: individualId }),
    requestsFor({ individualId }),
    db.select({ id: schema.signTemplates.id, title: schema.signTemplates.title }).from(schema.signTemplates).where(and(eq(schema.signTemplates.active, true), eq(schema.signTemplates.category, "person"))),
  ]);
  const openItems = requests.filter(row => !row.request.revokedAt).flatMap(row => row.items.filter(item => item.status === "pending" || item.status === "rejected"));
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Documents for {person.firstName}</h2>
          <p className="text-sm text-mute">Plans, insurance cards, medical records and consents. Every staff member can open these when they need them for care.</p>
        </div>
        {manager && person.active && (
          <PersonRequestForm
            action={requestPersonDocuments.bind(null, individualId)}
            templates={templates}
            types={types.map(type => ({ id: type.id, name: type.name }))}
            defaultName={person.guardianName}
            first={person.firstName}
          />
        )}
      </div>
      <OwnerDocuments owner={{ kind: "person", id: individualId }} types={types} docs={docs} openItems={openItems} manager={manager} maxMb={env.MAX_UPLOAD_MB} canOpen />
      {manager && <RequestHistory rows={requests} now={now} />}
    </section>
  );
}

/* A home's own documents, such as its fire inspection and emergency plan. */
export async function HomeDocumentsSection({ homeId, manager }: { homeId: string; manager: boolean }) {
  const [types, docs] = await Promise.all([documentTypes("business"), ownerDocuments({ kind: "business", homeId })]);
  const homeTypes = types.filter(type => type.perHome);
  if (!manager) {
    return (
      <Panel title="Home documents">
        <p className="px-5 py-4 text-sm text-mute">Coordinators keep this home&apos;s licences, inspections and plans. Ask them if you need a copy.</p>
      </Panel>
    );
  }
  return <OwnerDocuments owner={{ kind: "business", id: homeId }} types={homeTypes} docs={docs} manager maxMb={env.MAX_UPLOAD_MB} canOpen title="Inspections, plans and licences" />;
}
