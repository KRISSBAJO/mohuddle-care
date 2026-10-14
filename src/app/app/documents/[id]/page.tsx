import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, Eye, FileSignature, Fingerprint, History, ShieldCheck, Undo2 } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Field, Panel } from "@/components/app/ui";
import { DocIcon } from "@/components/docs/OwnerDocuments";
import { cn } from "@/lib/cn";
import { addMonths, DOC_STATE, docState, formatBytes } from "@/lib/documents";
import { dateKey, fmt } from "@/lib/format";
import { approveDocumentAction, rejectDocumentAction, setDocumentArchived, updateDocumentDetails } from "@/server/actions/documents";
import { canManage } from "@/server/auth";
import { canView } from "@/server/docs/service";
import { requireUser } from "@/server/guard";
import { documentDetail } from "@/server/queries/documents";

export const metadata = { title: "Document" };

const ACTION_TEXT: Record<string, string> = {
  "document:view": "Opened",
  "document:download": "Downloaded",
  "document:upload": "Filed",
  "document:approve": "Approved",
  "document:reject": "Returned",
  "document:edit": "Details changed",
  "document:archive": "Archived",
  "document:restore": "Restored",
};

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await documentDetail(id);
  if (!detail || !canView(user, detail.doc)) notFound();
  const { doc, typeRow: type } = detail;
  const manager = canManage(user);
  const today = dateKey();
  const state = docState(doc, today, type?.reminderDays ?? 30);
  const owner =
    doc.ownerKind === "staff"
      ? { name: `${detail.staffFirst} ${detail.staffLast}`, href: `/app/staff/${doc.staffId}#documents`, back: "Staff file" }
      : doc.ownerKind === "person"
        ? { name: `${detail.personFirst} ${detail.personLast}`, href: `/app/individuals/${doc.individualId}?tab=documents`, back: "Documents" }
        : { name: detail.home ?? "The agency", href: doc.homeId ? `/app/homes/${doc.homeId}?tab=documents` : "/app/documents?tab=business", back: "Documents" };
  const fileUrl = `/api/docs/file/${doc.id}`;
  const suggestedExpiry = doc.expiresOn ?? (type?.expires && type.validityMonths ? addMonths(doc.issuedOn ?? today, type.validityMonths) : "");

  return (
    <div className="max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={owner.href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> {owner.name} · {owner.back}
        </Link>
        <div className="flex gap-2">
          <a href={fileUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><ExternalLink className="h-3.5 w-3.5" /> Open in a new tab</a>
          <a href={`${fileUrl}?download=1`} className="btn-ghost btn-sm"><Download className="h-3.5 w-3.5" /> Download</a>
        </div>
      </div>

      <header className="mb-5 flex flex-wrap items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky"><DocIcon mime={doc.mimeType} className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{type?.name ?? (doc.ownerKind === "business" ? "Business document" : "Document")}</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2.5 text-2xl font-bold">
            {doc.title}
            <Badge tone={DOC_STATE[state].tone}>{DOC_STATE[state].text}</Badge>
            {detail.signature && <Badge tone="plum"><FileSignature className="h-3 w-3" /> Signed electronically</Badge>}
          </h1>
          <p className="mt-1 text-sm text-mute">
            For <Link href={owner.href} className="font-semibold text-ink hover:text-brand">{owner.name}</Link> · {doc.fileName} · {formatBytes(doc.sizeBytes)} · added {fmt.dateTime(doc.createdAt)} by {doc.uploadedByName || "staff"}
            {doc.source === "request_link" ? " through a private link" : doc.source === "staff_portal" ? " from their Mohuddle account" : ""}
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          {doc.mimeType === "application/pdf" ? (
            <iframe src={fileUrl} title={doc.title} className="h-[78vh] w-full bg-panel" />
          ) : doc.mimeType === "image/heic" ? (
            <div className="grid h-80 place-items-center p-6 text-center text-sm text-mute">
              iPhone photos (HEIC) cannot be shown in every browser. <a href={`${fileUrl}?download=1`} className="font-semibold text-brand">Download it</a> to view.
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a private file streamed through the Hub, not an optimisable public image
            <img src={fileUrl} alt={doc.title} className="max-h-[78vh] w-full bg-panel object-contain" />
          )}
        </section>

        <aside className="space-y-5">
          {doc.status === "submitted" && manager && (
            <Panel title="Review">
              <div className="space-y-4 p-5">
                <p className="text-sm text-mute">Check it is the right document, readable, complete and in date. Approving files it and updates any matching credential.</p>
                <ActionForm action={approveDocumentAction.bind(null, doc.id)} submitLabel="Approve and file">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Issued" htmlFor="ap-issued"><input id="ap-issued" name="issuedOn" type="date" className="field" defaultValue={doc.issuedOn ?? ""} /></Field>
                    <Field label="Expires" htmlFor="ap-expires"><input id="ap-expires" name="expiresOn" type="date" className="field" defaultValue={suggestedExpiry ?? ""} /></Field>
                  </div>
                  {type?.validityMonths && <p className="-mt-2 text-xs text-mute">{type.name} is usually valid for {type.validityMonths} months.</p>}
                  <Field label="Note" htmlFor="ap-note"><input id="ap-note" name="note" maxLength={1000} className="field" placeholder="Optional" /></Field>
                </ActionForm>
                <ModalForm action={rejectDocumentAction.bind(null, doc.id)} title="Return it to redo" description="They see your reason and can upload again with the same link or from their Mohuddle account." triggerLabel="Return to redo" triggerIcon="none" triggerTone="ghost" submitLabel="Return it">
                  <Field label="What needs fixing?" htmlFor="rj-reason"><textarea id="rj-reason" name="reason" rows={3} required minLength={5} maxLength={1000} className="field" placeholder="The back of the card is missing. Please upload both sides." /></Field>
                </ModalForm>
              </div>
            </Panel>
          )}

          <Panel
            title="Details"
            action={
              manager ? (
                <ModalForm action={updateDocumentDetails.bind(null, doc.id)} title="Edit details" triggerLabel="Edit" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save">
                  <Field label="Name" htmlFor="ed-title"><input id="ed-title" name="title" required className="field" defaultValue={doc.title} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Issued" htmlFor="ed-issued"><input id="ed-issued" name="issuedOn" type="date" className="field" defaultValue={doc.issuedOn ?? ""} /></Field>
                    <Field label="Expires" htmlFor="ed-expires"><input id="ed-expires" name="expiresOn" type="date" className="field" defaultValue={doc.expiresOn ?? ""} /></Field>
                  </div>
                  <Field label="Notes" htmlFor="ed-notes"><textarea id="ed-notes" name="notes" rows={3} className="field" defaultValue={doc.notes} /></Field>
                </ModalForm>
              ) : undefined
            }
          >
            <dl className="divide-y divide-line/60 text-sm">
              {[
                ["Issued", doc.issuedOn ? fmt.dayLong(doc.issuedOn) : "Not recorded"],
                ["Expires", doc.expiresOn ? fmt.dayLong(doc.expiresOn) : type?.expires ? "Not recorded" : "Does not expire"],
                ["Reviewed", doc.reviewedAt ? `${fmt.dateTime(doc.reviewedAt)} by ${detail.reviewer ?? "staff"}` : "Not yet"],
                ["Review note", doc.reviewNote || "—"],
                ["Notes", doc.notes || "—"],
              ].map(([term, value]) => (
                <div key={term} className="grid grid-cols-[7rem_1fr] gap-2 px-5 py-2.5">
                  <dt className="text-mute">{term}</dt>
                  <dd className={cn(term === "Expires" && doc.expiresOn && doc.expiresOn < today && "font-semibold text-flag")}>{value}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[7rem_1fr] gap-2 px-5 py-2.5">
                <dt className="inline-flex items-center gap-1 text-mute"><Fingerprint className="h-3.5 w-3.5" /> SHA-256</dt>
                <dd className="break-all font-mono text-[11px] text-mute">{doc.sha256}</dd>
              </div>
            </dl>
            {manager && (
              <div className="border-t border-line px-5 py-3">
                {doc.status === "archived" ? (
                  <ConfirmAction action={setDocumentArchived.bind(null, doc.id, false)} label="Restore to the file" />
                ) : doc.status !== "submitted" ? (
                  <ConfirmAction action={setDocumentArchived.bind(null, doc.id, true)} label="Archive" confirm="Archive this document? It is kept but no longer counts as on file." />
                ) : null}
              </div>
            )}
          </Panel>

          {detail.signature && (
            <Panel title="Signature evidence">
              <dl className="space-y-1.5 p-5 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-sage"><ShieldCheck className="h-4 w-4" /> Signed by {detail.signature.signerName}{detail.signature.signerRelation ? ` (${detail.signature.signerRelation})` : ""}</p>
                <p className="text-mute">{fmt.dateTime(detail.signature.signedAt)} · {detail.signature.method === "drawn" ? "drawn signature" : "typed signature"} · {detail.signature.initialsCount} initials</p>
                <p className="text-mute">From {detail.signature.ip || "unknown address"}</p>
                <p className="break-all font-mono text-[11px] text-dim">Content {detail.signature.contentHash}</p>
                <p className="text-xs text-mute">The certificate page at the end of the PDF repeats this record.</p>
              </dl>
            </Panel>
          )}

          {detail.versions.length > 1 && (
            <Panel title="Versions">
              <ul className="divide-y divide-line/60">
                {detail.versions.map(version => (
                  <li key={version.id}>
                    <Link href={`/app/documents/${version.id}`} className={cn("flex items-center gap-2 px-5 py-2.5 text-sm hover:bg-panel/50", version.id === doc.id && "bg-sky/40 font-semibold")}>
                      <History className="h-3.5 w-3.5 text-dim" />
                      <span className="flex-1">{fmt.day(version.createdAt)} · {version.fileName}</span>
                      <Badge tone={DOC_STATE[docState(version, today, type?.reminderDays ?? 30)].tone}>{DOC_STATE[docState(version, today, type?.reminderDays ?? 30)].text}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {manager && (
            <Panel title="Who has opened it">
              {detail.access.length === 0 ? (
                <p className="px-5 py-4 text-sm text-mute">Nobody yet.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {detail.access.map((entry, index) => (
                    <li key={index} className="flex items-center gap-2 px-5 py-2 text-xs">
                      {entry.action === "document:approve" ? <CheckCircle2 className="h-3.5 w-3.5 text-sage" /> : entry.action === "document:reject" ? <Undo2 className="h-3.5 w-3.5 text-flag" /> : <Eye className="h-3.5 w-3.5 text-dim" />}
                      <span className="flex-1">{ACTION_TEXT[entry.action] ?? entry.action} by {entry.who ?? "someone"}</span>
                      <span className="text-dim">{fmt.dateTime(entry.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
