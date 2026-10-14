import Link from "next/link";
import { AlertTriangle, Building2, CheckCircle2, ClipboardCheck, FileClock, FileSignature, FolderOpen, Inbox, LayoutGrid, Search, Send, Settings2, UserRound, Users } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Select } from "@/components/app/Select";
import { Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { DocIcon, OwnerDocuments } from "@/components/docs/OwnerDocuments";
import { FreshLinkButton } from "@/components/docs/ShareLink";
import { cn } from "@/lib/cn";
import { DOC_STATE, docState, REQUIREMENT_STATE, type RequirementState } from "@/lib/documents";
import { dateKey, fmt } from "@/lib/format";
import { freshRequestLink, saveDocumentType, setDocumentTypeActive, withdrawRequest } from "@/server/actions/documents";
import { requireManager } from "@/server/guard";
import {
  businessCompliance,
  documentCounts,
  documentTypes,
  expiringDocuments,
  ownerDocuments,
  peopleCompliance,
  requestsFor,
  reviewQueue,
  searchDocuments,
  staffCompliance,
  type Cell,
} from "@/server/queries/documents";
import { env } from "@/server/env";
import { requestTime } from "@/server/clock";
import { TemplatesTab } from "@/components/docs/TemplatesTab";

export const metadata = { title: "Documents" };

const TABS = [
  ["overview", "Overview", LayoutGrid],
  ["review", "To review", Inbox],
  ["staff", "Staff files", Users],
  ["people", "People", UserRound],
  ["business", "Business", Building2],
  ["requests", "Requests", Send],
  ["signing", "Signing", FileSignature],
  ["types", "Document types", Settings2],
] as const;
type Tab = (typeof TABS)[number][0];

const cellTone: Record<RequirementState, string> = {
  valid: "bg-sage-soft text-sage",
  expiring: "bg-accent-soft text-[#8a5a10]",
  pending_review: "bg-sky text-brand-deep",
  requested: "bg-panel text-mute",
  missing: "bg-flag-soft text-flag",
  expired: "bg-flag text-white",
  rejected: "bg-flag-soft text-flag",
};

function Matrix({ types, rows, hrefFor }: { types: { id: string; name: string }[]; rows: { key: string; name: string; sub: string; cells: Record<string, Cell>; ok: number; total: number; applicable?: string[] }[]; hrefFor: (key: string) => string }) {
  if (!rows.length) return <Empty>Nobody to show.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] min-w-52 bg-white px-4 py-2 text-left font-semibold text-mute">Name</th>
            <th className="px-2 py-2 text-left font-semibold text-mute">On file</th>
            {types.map(type => (
              <th key={type.id} className="h-36 min-w-9 px-0.5 align-bottom font-medium text-mute">
                <span className="mx-auto block w-4 whitespace-nowrap [writing-mode:vertical-rl] rotate-180 text-left" title={type.name}>{type.name.length > 30 ? `${type.name.slice(0, 29)}…` : type.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-t border-line/60">
              <th scope="row" className="sticky left-0 z-[1] bg-white px-4 py-2 text-left font-normal">
                <Link href={hrefFor(row.key)} className="text-sm font-semibold text-ink hover:text-brand">{row.name}</Link>
                <span className="block text-[11px] text-mute">{row.sub}</span>
              </th>
              <td className="px-2 py-2">
                <span className={cn("font-semibold", row.ok === row.total ? "text-sage" : "text-[#8a5a10]")}>{row.ok}/{row.total}</span>
              </td>
              {types.map(type => {
                const cell = row.cells[type.id];
                if (!cell) return <td key={type.id} className="px-0.5 py-1.5 text-center text-line" title="Not needed for this role">·</td>;
                return (
                  <td key={type.id} className="px-0.5 py-1.5 text-center">
                    <Link
                      href={cell.doc ? `/app/documents/${cell.doc.id}` : hrefFor(row.key)}
                      title={`${type.name}: ${REQUIREMENT_STATE[cell.state].text}${cell.doc?.expiresOn ? `, expires ${cell.doc.expiresOn}` : ""}`}
                      className={cn("mx-auto grid h-7 w-8 place-items-center rounded-md text-[9px] font-bold", cellTone[cell.state])}
                    >
                      {REQUIREMENT_STATE[cell.state].short}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-2.5 text-[11px] text-mute">
      {(Object.keys(REQUIREMENT_STATE) as RequirementState[]).map(state => (
        <span key={state} className="inline-flex items-center gap-1.5"><span className={cn("grid h-4 w-6 place-items-center rounded text-[8px] font-bold", cellTone[state])}>{REQUIREMENT_STATE[state].short}</span>{REQUIREMENT_STATE[state].text}</span>
      ))}
    </p>
  );
}

type DocRow = Awaited<ReturnType<typeof reviewQueue>>[number];
const ownerName = (row: DocRow) => (row.staffFirst ? `${row.staffFirst} ${row.staffLast}` : row.personFirst ? `${row.personFirst} ${row.personLast}` : (row.home ?? "Agency"));

function DocList({ rows, empty, today }: { rows: DocRow[]; empty: string; today: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-line/60">
      {rows.map(row => {
        const state = docState(row.doc, today, 30);
        return (
          <li key={row.doc.id}>
            <Link href={`/app/documents/${row.doc.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-panel/50">
              <DocIcon mime={row.doc.mimeType} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{row.doc.title}</span>
                <span className="block text-xs text-mute">
                  {ownerName(row)} · {row.doc.ownerKind === "staff" ? "Staff" : row.doc.ownerKind === "person" ? "Person supported" : "Business"} · added {fmt.dateTime(row.doc.createdAt)}
                  {row.doc.uploadedByName ? ` by ${row.doc.uploadedByName}` : ""}
                </span>
              </span>
              {row.doc.expiresOn && <span className={cn("text-xs", row.doc.expiresOn < today ? "font-semibold text-flag" : "text-mute")}>{row.doc.expiresOn < today ? "Expired" : "Expires"} {fmt.dayLong(row.doc.expiresOn)}</span>}
              <Badge tone={DOC_STATE[state].tone}>{DOC_STATE[state].text}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TypeFields({ type, prefix, category }: { type?: Awaited<ReturnType<typeof documentTypes>>[number]; prefix: string; category?: string }) {
  const roles = [["dsp", "DSP"], ["residential_manager", "Residential manager"], ["coordinator", "Coordinator"], ["nurse", "Nurse"], ["admin", "Admin"]] as const;
  const box = "flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label="Name" htmlFor={`${prefix}-name`}><input id={`${prefix}-name`} name="name" required minLength={2} maxLength={120} className="field" defaultValue={type?.name} /></Field>
        <Field label="For" htmlFor={`${prefix}-cat`}>
          <Select
            id={`${prefix}-cat`}
            name="category"
            defaultValue={type?.category ?? category ?? "staff"}
            options={[
              { value: "staff", label: "Staff" },
              { value: "person", label: "People supported" },
              { value: "business", label: "Business" },
            ]}
          />
        </Field>
      </div>
      <Field label="Description" htmlFor={`${prefix}-desc`}><input id={`${prefix}-desc`} name="description" maxLength={500} className="field" defaultValue={type?.description} /></Field>
      <Field label="Instructions for whoever uploads it" htmlFor={`${prefix}-ins`}><textarea id={`${prefix}-ins`} name="instructions" rows={2} maxLength={1000} className="field" defaultValue={type?.instructions} placeholder="Photograph both sides on a flat surface." /></Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={box}><input type="checkbox" name="required" defaultChecked={type?.required ?? true} className="h-4 w-4 accent-[#1b6fa8]" /> Required</label>
        <label className={box}><input type="checkbox" name="needsApproval" defaultChecked={type?.needsApproval ?? true} className="h-4 w-4 accent-[#1b6fa8]" /> Needs approval when sent in</label>
        <label className={box}><input type="checkbox" name="expires" defaultChecked={type?.expires ?? false} className="h-4 w-4 accent-[#1b6fa8]" /> Expires</label>
        <label className={box}><input type="checkbox" name="perHome" defaultChecked={type?.perHome ?? false} className="h-4 w-4 accent-[#1b6fa8]" /> Business: one per home</label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Valid for (months)" htmlFor={`${prefix}-valid`}><input id={`${prefix}-valid`} name="validityMonths" type="number" min={1} max={120} className="field" defaultValue={type?.validityMonths ?? ""} /></Field>
        <Field label="Remind days ahead" htmlFor={`${prefix}-remind`}><input id={`${prefix}-remind`} name="reminderDays" type="number" min={0} max={365} className="field" defaultValue={type?.reminderDays ?? 30} /></Field>
        <Field label="Order" htmlFor={`${prefix}-order`}><input id={`${prefix}-order`} name="sortOrder" type="number" min={0} max={999} className="field" defaultValue={type?.sortOrder ?? 50} /></Field>
      </div>
      <fieldset>
        <legend className="label">Staff roles it applies to (none ticked means everyone)</legend>
        <div className="flex flex-wrap gap-2">
          {roles.map(([value, text]) => (
            <label key={value} className={box}><input type="checkbox" name="roles" value={value} defaultChecked={type?.roles.includes(value)} className="h-4 w-4 accent-[#1b6fa8]" /> {text}</label>
          ))}
        </div>
      </fieldset>
      <Field label="Updates this staff credential when approved" htmlFor={`${prefix}-cred`} hint="Exactly as named in Settings, for example CPR and First Aid. Leave blank for none.">
        <input id={`${prefix}-cred`} name="credentialType" maxLength={80} className="field" defaultValue={type?.credentialType} />
      </Field>
    </>
  );
}

/*
 * The document center: what needs review, who is missing what, what is about to expire, every
 * request sent, the documents to sign, and the types of document the agency keeps.
 */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  await requireManager();
  const { tab: tabParam, q } = await searchParams;
  const tab: Tab = TABS.some(([value]) => value === tabParam) ? (tabParam as Tab) : "overview";
  const today = dateKey();
  const counts = await documentCounts();
  const badges: Partial<Record<Tab, { n: number; tone: string }>> = {
    review: counts.review ? { n: counts.review, tone: "bg-accent-soft text-[#8a5a10]" } : undefined,
    requests: counts.requests ? { n: counts.requests, tone: "bg-panel text-mute" } : undefined,
  };

  return (
    <div className="max-w-7xl">
      <PageHeader
        eyebrow="Documents"
        title="Document center"
        description="Every file the agency keeps, for staff, for the people we support and for the business: requested by private link, reviewed, approved, watched for expiry and signed online."
        action={
          <form action="/app/documents" className="flex items-center gap-2">
            <input type="hidden" name="tab" value="overview" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
              <input name="q" defaultValue={q} placeholder="Search all documents" className="field w-64 py-2 pl-9" aria-label="Search all documents" />
            </div>
          </form>
        }
      />
      <nav className="mb-6 flex flex-wrap gap-1 rounded-xl bg-panel p-1" aria-label="Document center sections">
        {TABS.map(([value, text, Icon]) => (
          <Link key={value} href={value === "overview" ? "/app/documents" : `/app/documents?tab=${value}`} aria-current={tab === value ? "page" : undefined} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold", tab === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}>
            <Icon className="h-4 w-4" /> {text}
            {badges[value] && <span className={cn("chip px-1.5 py-0", badges[value]!.tone)}>{badges[value]!.n}</span>}
          </Link>
        ))}
      </nav>
      {tab === "overview" && <Overview today={today} counts={counts} q={q} />}
      {tab === "review" && <Panel title="Waiting for review"><DocList rows={await reviewQueue()} empty="Nothing waiting. New uploads from staff appear here." today={today} /></Panel>}
      {tab === "staff" && <StaffTab />}
      {tab === "people" && <PeopleTab />}
      {tab === "business" && <BusinessTab today={today} />}
      {tab === "requests" && <RequestsTab />}
      {tab === "signing" && <TemplatesTab />}
      {tab === "types" && <TypesTab />}
    </div>
  );
}

async function Overview({ today, counts, q }: { today: string; counts: Awaited<ReturnType<typeof documentCounts>>; q?: string }) {
  const [queue, expiring, staff, people] = await Promise.all([reviewQueue(), expiringDocuments(30), staffCompliance(), peopleCompliance()]);
  const results = q?.trim() ? await searchDocuments(q.trim()) : null;
  const staffMissing = staff.rows.reduce((sum, row) => sum + row.problems, 0);
  const peopleMissing = people.rows.reduce((sum, row) => sum + row.problems, 0);
  const tiles = [
    { label: "To review", value: counts.review, icon: Inbox, href: "/app/documents?tab=review", tone: counts.review ? "warn" : "good" },
    { label: "Expiring in 30 days", value: counts.expiring, icon: FileClock, href: "#expiring", tone: counts.expiring ? "warn" : "good" },
    { label: "Expired", value: counts.expired, icon: AlertTriangle, href: "#expiring", tone: counts.expired ? "bad" : "good" },
    { label: "Staff gaps", value: staffMissing, icon: Users, href: "/app/documents?tab=staff", tone: staffMissing ? "bad" : "good" },
    { label: "People gaps", value: peopleMissing, icon: UserRound, href: "/app/documents?tab=people", tone: peopleMissing ? "bad" : "good" },
    { label: "Open requests", value: counts.requests, icon: Send, href: "/app/documents?tab=requests", tone: "neutral" },
  ];
  return (
    <div className="space-y-6">
      {results && (
        <Panel title={`Search: “${q}” (${results.length})`}>
          <DocList rows={results} empty="No documents match." today={today} />
        </Panel>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(tile => (
          <Link key={tile.label} href={tile.href} className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]">
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tile.tone === "bad" ? "bg-flag-soft text-flag" : tile.tone === "warn" ? "bg-accent-soft text-[#8a5a10]" : tile.tone === "good" ? "bg-sage-soft text-sage" : "bg-sky text-brand-deep")}>
              {tile.value === 0 && tile.tone !== "neutral" ? <CheckCircle2 className="h-4 w-4" /> : <tile.icon className="h-4 w-4" />}
            </span>
            <span>
              <span className="block font-display text-xl font-bold">{tile.value}</span>
              <span className="block text-xs text-mute">{tile.label}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Waiting for review" action={<Link href="/app/documents?tab=review" className="text-xs font-semibold text-brand">All</Link>}>
          <DocList rows={queue.slice(0, 8)} empty="Nothing waiting." today={today} />
        </Panel>
        <div id="expiring">
          <Panel title="Expired or expiring in 30 days">
            <DocList rows={expiring} empty="Nothing expires in the next 30 days." today={today} />
          </Panel>
        </div>
      </div>
      <Panel title="Staff files that need attention" action={<Link href="/app/documents?tab=staff" className="text-xs font-semibold text-brand">Staff files</Link>}>
        {staff.rows.filter(row => row.problems).length === 0 ? (
          <Empty>Every staff file is complete.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {staff.rows
              .filter(row => row.problems)
              .sort((a, b) => b.problems - a.problems)
              .slice(0, 8)
              .map(row => (
                <li key={row.person.id}>
                  <Link href={`/app/staff/${row.person.id}#documents`} className="flex items-center gap-3 px-5 py-3 hover:bg-panel/50">
                    <FolderOpen className="h-4 w-4 text-brand" />
                    <span className="flex-1 text-sm"><span className="font-semibold">{row.person.firstName} {row.person.lastName}</span> <span className="text-mute">· {row.ok} of {row.total} on file</span></span>
                    <Badge tone="bad">{row.problems} missing or expired</Badge>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

async function StaffTab() {
  const { types, rows } = await staffCompliance();
  return (
    <Panel title={`Staff files · ${rows.length} active staff`} action={<span className="text-xs text-mute">Click a name to open their file, or a square to open the document</span>}>
      <Matrix
        types={types}
        rows={rows.map(row => ({ key: row.person.id, name: `${row.person.firstName} ${row.person.lastName}`, sub: [row.person.role.replace("_", " "), row.person.home].filter(Boolean).join(" · "), cells: row.cells, ok: row.ok, total: row.total }))}
        hrefFor={key => `/app/staff/${key}#documents`}
      />
      <Legend />
    </Panel>
  );
}

async function PeopleTab() {
  const { types, rows } = await peopleCompliance();
  return (
    <Panel title={`People supported · ${rows.length}`}>
      <Matrix
        types={types}
        rows={rows.map(row => ({ key: row.person.id, name: `${row.person.firstName} ${row.person.lastName}`, sub: row.person.home ?? "No home", cells: row.cells, ok: row.ok, total: row.total }))}
        hrefFor={key => `/app/individuals/${key}?tab=documents`}
      />
      <Legend />
    </Panel>
  );
}

async function BusinessTab({ today }: { today: string }) {
  const data = await businessCompliance();
  const agencyDocs = await ownerDocuments({ kind: "business", homeId: null });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-lg font-bold">Agency documents</h2>
        <OwnerDocuments owner={{ kind: "business", id: null }} types={data.agencyTypes} docs={agencyDocs} manager maxMb={env.MAX_UPLOAD_MB} canOpen title="Licenses, insurance and policies" />
      </div>
      <Panel title="Each home">
        <Matrix
          types={data.homeTypes}
          rows={data.homes.map(row => ({ key: row.home.id, name: row.home.name, sub: "", cells: row.cells, ok: Object.values(row.cells).filter(cell => cell.state === "valid" || cell.state === "expiring").length, total: data.homeTypes.length }))}
          hrefFor={key => `/app/homes/${key}?tab=documents`}
        />
        <Legend />
      </Panel>
      <p className="text-xs text-mute">Checked {fmt.dayLong(today)}.</p>
    </div>
  );
}

async function RequestsTab() {
  const [rows, now] = await Promise.all([requestsFor(), requestTime()]);
  return (
    <Panel title="Requests sent">
      {rows.length === 0 ? (
        <Empty>No requests yet. Send one from a staff member&apos;s file.</Empty>
      ) : (
        <ul className="divide-y divide-line/60">
          {rows.map(({ request, items, staffFirst, staffLast, personFirst, personLast }) => {
            const done = items.filter(item => item.status === "approved").length;
            const linkState = request.revokedAt ? "Withdrawn" : request.completedAt ? "Complete" : request.expiresAt.getTime() < now ? "Link expired" : `Link works until ${fmt.dateTime(request.expiresAt)}`;
            return (
              <li key={request.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {staffFirst ? <Link href={`/app/staff/${request.staffId}#documents`} className="hover:text-brand">{staffFirst} {staffLast}</Link> : `${request.recipientName}${personFirst ? ` for ${personFirst} ${personLast}` : ""}`}
                      <span className="font-normal text-mute"> · {request.title}</span>
                    </p>
                    <p className="text-xs text-mute">
                      Sent {fmt.dateTime(request.createdAt)} · {done} of {items.length} approved · {linkState}
                      {request.lastOpenedAt ? ` · link last used ${fmt.dateTime(request.lastOpenedAt)}` : ""}
                      {request.dueOn ? ` · needed by ${fmt.dayLong(request.dueOn)}` : ""}
                    </p>
                  </div>
                  {!request.revokedAt && !request.completedAt && (
                    <div className="flex flex-wrap items-start gap-2">
                      <FreshLinkButton action={freshRequestLink.bind(null, request.id)} />
                      <ConfirmAction action={withdrawRequest.bind(null, request.id)} label="Withdraw" confirm="Withdraw this request? The link stops working and it leaves their Mohuddle account." />
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {items.map(item => (
                    <span key={item.id} className={cn("chip px-2 py-0.5", item.status === "approved" ? "bg-sage-soft text-sage" : item.status === "submitted" ? "bg-sky text-brand-deep" : item.status === "rejected" ? "bg-flag-soft text-flag" : "bg-panel text-mute")}>
                      {item.kind === "sign" && <FileSignature className="h-3 w-3" />} {item.label}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

async function TypesTab() {
  const types = await documentTypes(undefined, true);
  const groups = [
    ["staff", "Staff"],
    ["person", "People supported"],
    ["business", "Business"],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ModalForm action={saveDocumentType.bind(null, null)} title="Add a document type" triggerLabel="Add document type" submitLabel="Add">
          <TypeFields prefix="new-type" />
        </ModalForm>
      </div>
      {groups.map(([category, title]) => (
        <Panel key={category} title={`${title} (${types.filter(type => type.category === category && type.active).length})`}>
          <ul className="divide-y divide-line/60">
            {types
              .filter(type => type.category === category)
              .map(type => (
                <li key={type.id} className={cn("flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center", !type.active && "bg-panel/40 opacity-70")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{type.name}</span>
                      {type.required && <Badge tone="brand">Required</Badge>}
                      {type.expires && <Badge tone="warn">{type.validityMonths ? `Every ${type.validityMonths} months` : "Expires"}</Badge>}
                      {type.perHome && <Badge tone="neutral">Per home</Badge>}
                      {type.roles.length > 0 && <Badge tone="plum">{type.roles.map(role => role.replace("_", " ")).join(", ")}</Badge>}
                      {type.credentialType && <Badge tone="good"><ClipboardCheck className="h-3 w-3" /> {type.credentialType}</Badge>}
                      {!type.active && <Badge tone="neutral">Retired</Badge>}
                    </p>
                    {type.description && <p className="text-xs text-mute">{type.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <ModalForm action={saveDocumentType.bind(null, type.id)} title={`Edit ${type.name}`} triggerLabel="Edit" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save">
                      <TypeFields type={type} prefix={`type-${type.id.slice(0, 8)}`} />
                    </ModalForm>
                    <ConfirmAction action={setDocumentTypeActive.bind(null, type.id, !type.active)} label={type.active ? "Retire" : "Restore"} confirm={type.active ? `Retire ${type.name}? It stops being required. Filed documents are kept.` : undefined} />
                  </div>
                </li>
              ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
