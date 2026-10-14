import Link from "next/link";
import { Archive, Eye, FileText, History, Image as ImageIcon, Plus, Upload } from "lucide-react";
import { Badge, Empty, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { DOC_STATE, docState, formatBytes, REQUIREMENT_STATE, requirementState, type RequirementState } from "@/lib/documents";
import { dateKey, fmt } from "@/lib/format";
import type { schema } from "@/server/db";
import { FileUpload } from "./FileUpload";

type Type = typeof schema.documentTypes.$inferSelect;
type Doc = typeof schema.documents.$inferSelect;
type Owner = { kind: "staff" | "person" | "business"; id: string | null };

const dateField = (name: string, labelText: string) => (
  <label className="grid gap-1 text-xs font-semibold text-mute">
    {labelText}
    <input data-extra name={name} type="date" className="field py-1.5 text-sm font-normal text-ink" />
  </label>
);

export function DocIcon({ mime, className }: { mime: string; className?: string }) {
  return mime.startsWith("image/") ? <ImageIcon className={cn("h-4 w-4 text-plum", className)} /> : <FileText className={cn("h-4 w-4 text-brand", className)} />;
}

/* An upload box that files a document of one type straight away, with optional dates. */
function AdminUpload({ owner, type, maxMb, label }: { owner: Owner; type: Type | null; maxMb: number; label: string }) {
  return (
    <FileUpload
      endpoint="/api/docs/upload"
      fields={{ ownerKind: owner.kind, ownerId: owner.id ?? "", typeId: type?.id ?? "" }}
      label={label}
      hint={type?.expires ? "Add the dates so reminders work" : "PDF or photo"}
      maxMb={maxMb}
      compact
      extra={
        <div className="grid gap-2 sm:grid-cols-3">
          {!type && (
            <label className="grid gap-1 text-xs font-semibold text-mute sm:col-span-3">
              Name
              <input data-extra name="title" required className="field py-1.5 text-sm font-normal text-ink" placeholder="What is this document?" />
            </label>
          )}
          {dateField("issuedOn", "Issued")}
          {(type?.expires ?? true) && dateField("expiresOn", type?.validityMonths ? `Expires (blank = ${type.validityMonths} months)` : "Expires")}
        </div>
      }
    />
  );
}

/*
 * One owner's documents against what they need: a row per document type with its state, the current
 * file and a way to replace it. Everything else they hold is listed after, and old versions last.
 */
export function OwnerDocuments({
  owner,
  types,
  docs,
  openItems = [],
  manager,
  maxMb,
  canOpen,
  title = "Documents",
}: {
  owner: Owner;
  types: Type[];
  docs: Doc[];
  openItems?: { typeId: string | null }[];
  manager: boolean;
  maxMb: number;
  canOpen: boolean;
  title?: string;
}) {
  const today = dateKey();
  const live = docs.filter(doc => doc.status !== "superseded" && doc.status !== "archived");
  const old = docs.filter(doc => doc.status === "superseded" || doc.status === "archived");
  const rows = types.map(type => {
    const mine = live.filter(doc => doc.typeId === type.id);
    const state = requirementState(mine, today, type.reminderDays, openItems.some(item => item.typeId === type.id));
    const current = mine.find(doc => doc.status === "approved") ?? mine[0] ?? null;
    return { type, state, current };
  });
  const shownTypeIds = new Set(types.map(type => type.id));
  const others = live.filter(doc => !doc.typeId || !shownTypeIds.has(doc.typeId));
  const attention = rows.filter(row => row.type.required && !["valid", "pending_review"].includes(row.state)).length;
  const counts = rows.reduce<Record<string, number>>((all, row) => ({ ...all, [row.state]: (all[row.state] ?? 0) + 1 }), {});

  const open = (doc: Doc) =>
    canOpen ? (
      <Link href={`/app/documents/${doc.id}`} className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-ink hover:text-brand">
        <DocIcon mime={doc.mimeType} /> <span className="truncate">{doc.fileName}</span>
      </Link>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-mute"><DocIcon mime={doc.mimeType} /> On file</span>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(REQUIREMENT_STATE) as RequirementState[])
          .filter(state => counts[state])
          .map(state => (
            <Badge key={state} tone={REQUIREMENT_STATE[state].tone}>{counts[state]} {REQUIREMENT_STATE[state].text.toLowerCase()}</Badge>
          ))}
        {attention === 0 && rows.length > 0 && <Badge tone="good">Every required document is on file</Badge>}
      </div>

      <Panel title={title}>
        {rows.length === 0 ? (
          <Empty>No document types apply here.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map(({ type, state, current }) => {
              const tone = REQUIREMENT_STATE[state].tone;
              return (
                <li key={type.id} className={cn("px-5 py-3.5", (state === "missing" || state === "expired" || state === "rejected") && type.required && "bg-flag-soft/25")}>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold">{type.name}</span>
                        {type.required ? <span className="text-[11px] text-dim">Required</span> : <span className="text-[11px] text-dim">Optional</span>}
                        <Badge tone={tone}>{REQUIREMENT_STATE[state].text}</Badge>
                      </p>
                      {current ? (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-mute">
                          {open(current)}
                          <span>Added {fmt.day(current.createdAt)}</span>
                          {current.expiresOn && <span className={current.expiresOn < today ? "font-semibold text-flag" : undefined}>Expires {fmt.dayLong(current.expiresOn)}</span>}
                          {current.status === "rejected" && current.reviewNote && <span className="text-flag">Returned: {current.reviewNote}</span>}
                        </p>
                      ) : (
                        type.description && <p className="mt-0.5 text-xs text-mute">{type.description}</p>
                      )}
                    </div>
                    {manager && (
                      <details className="group lg:w-80">
                        <summary className="flex cursor-pointer list-none items-center justify-end gap-1 text-xs font-semibold text-brand">
                          <Upload className="h-3.5 w-3.5" /> {current ? "Upload a newer one" : "Upload"}
                        </summary>
                        <div className="mt-2">
                          <AdminUpload owner={owner} type={type} maxMb={maxMb} label="Choose file" />
                        </div>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title={`Other documents (${others.length})`}
        action={
          manager ? (
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-brand"><Plus className="h-3.5 w-3.5" /> Add a document</summary>
              <div className="absolute right-0 z-20 mt-2 w-[min(26rem,calc(100vw-3rem))] rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-float)]">
                <AdminUpload owner={owner} type={null} maxMb={maxMb} label="Choose file" />
              </div>
            </details>
          ) : undefined
        }
      >
        {others.length === 0 ? (
          <Empty>Nothing else on file.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {others.map(doc => {
              const state = docState(doc, today, 30);
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{doc.title}</span>
                    <span className="flex flex-wrap gap-x-3 text-xs text-mute">
                      {open(doc)} <span>{formatBytes(doc.sizeBytes)}</span> <span>Added {fmt.day(doc.createdAt)}</span>
                      {doc.expiresOn && <span>Expires {fmt.dayLong(doc.expiresOn)}</span>}
                    </span>
                  </span>
                  <Badge tone={DOC_STATE[state].tone}>{DOC_STATE[state].text}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {old.length > 0 && canOpen && (
        <details className="card overflow-hidden">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-sm font-bold"><History className="h-4 w-4 text-mute" /> Earlier versions and archived ({old.length})</summary>
          <ul className="divide-y divide-line/60 border-t border-line">
            {old.map(doc => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                {doc.status === "archived" ? <Archive className="h-4 w-4 text-dim" /> : <History className="h-4 w-4 text-dim" />}
                <Link href={`/app/documents/${doc.id}`} className="min-w-0 flex-1 truncate hover:text-brand">{doc.title} · {doc.fileName}</Link>
                <span className="text-xs text-mute">{fmt.day(doc.createdAt)}</span>
                <Badge tone="neutral">{doc.status === "archived" ? "Archived" : "Replaced"}</Badge>
                <Link href={`/app/documents/${doc.id}`} className="text-mute hover:text-brand" aria-label="Open"><Eye className="h-4 w-4" /></Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
