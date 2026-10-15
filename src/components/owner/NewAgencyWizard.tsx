"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  PlusCircle,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Select } from "@/components/app/Select";
import { cn } from "@/lib/cn";
import { TIME_ZONES } from "@/lib/format";
import { checkSlugAction, createAgencyAction, type CreateAgencyState } from "@/server/actions/owner";

type Draft = { name: string; legalName: string; slug: string; timezone: string; phone: string; email: string; address: string; cityStateZip: string; adminName: string; adminEmail: string };
const EMPTY: Draft = { name: "", legalName: "", slug: "", timezone: "America/Chicago", phone: "", email: "", address: "", cityStateZip: "", adminName: "", adminEmail: "" };

const STEPS = [
  { title: "The agency", hint: "Name and web address", icon: Building2 },
  { title: "Contact", hint: "Office details", icon: MapPin },
  { title: "Administrator", hint: "Who sets it up", icon: UserRound },
  { title: "Review", hint: "Check and create", icon: ShieldCheck },
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "A";

/* One input with its label, an icon, and a line of help or the problem with it. */
function Input({ label, icon: Icon, hint, error, optional, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon: LucideIcon; hint?: string; error?: string; optional?: boolean }) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline justify-between text-[13px] font-semibold text-ink">
        {label}
        {optional && <span className="text-[11px] font-medium text-dim">Optional</span>}
      </span>
      <span className={cn("wizard-input group flex items-center gap-2.5 rounded-xl border bg-white px-3.5 transition focus-within:ring-4", error ? "border-flag/50 focus-within:ring-flag-soft" : "border-line focus-within:border-brand focus-within:ring-sky")}>
        <Icon className={cn("h-4 w-4 shrink-0 transition", error ? "text-flag" : "text-dim group-focus-within:text-brand")} aria-hidden="true" />
        <input {...props} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-dim" aria-invalid={Boolean(error)} />
      </span>
      {error ? <span className="text-xs font-medium text-flag">{error}</span> : hint ? <span className="text-xs text-mute">{hint}</span> : null}
    </label>
  );
}

/*
 * Onboarding an agency, one step at a time, with its card built live beside the form. Ends on what
 * was made and the first administrator's setup link.
 */
export function NewAgencyWizard({ baseHost, trialText }: { baseHost: string; trialText: string }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [slugEdited, setSlugEdited] = useState(false);
  const [legalEdited, setLegalEdited] = useState(false);
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);
  const [slugCheck, setSlugCheck] = useState<{ slug: string; ok: boolean; message: string } | null>(null);
  const [result, setResult] = useState<CreateAgencyState | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, startCreating] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const zoneLabel = TIME_ZONES.find(zone => zone.value === draft.timezone)?.label ?? draft.timezone;

  // The web address is checked a moment after typing stops.
  function checkSlug(slug: string) {
    if (timer.current) clearTimeout(timer.current);
    if (!slug) return setSlugCheck(null);
    timer.current = setTimeout(async () => {
      const answer = await checkSlugAction(slug);
      setSlugCheck({ slug, ...answer });
    }, 350);
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => {
      const next = { ...current, [key]: value };
      // The web address and legal name follow the name until they are typed in themselves.
      if (key === "name" && !slugEdited) next.slug = toSlug(String(value));
      if (key === "name" && !legalEdited) next.legalName = String(value);
      if ((key === "name" && !slugEdited) || key === "slug") checkSlug(next.slug);
      return next;
    });
  }

  const problems: Partial<Record<keyof Draft, string>> = {};
  if (draft.name.trim().length < 2) problems.name = "Give the agency a name.";
  if (draft.legalName.trim().length < 2) problems.legalName = "The legal name, as printed on signed documents.";
  if (!draft.slug) problems.slug = "Choose a web address.";
  else if (slugCheck && slugCheck.slug === draft.slug && !slugCheck.ok) problems.slug = slugCheck.message;
  if (draft.email && !EMAIL.test(draft.email)) problems.email = "Check the office email address.";
  if (draft.adminName.trim().length < 2) problems.adminName = "Who will set the agency up?";
  if (!EMAIL.test(draft.adminEmail)) problems.adminEmail = "Their setup link goes to this address.";
  const fieldsOf: (keyof Draft)[][] = [["name", "legalName", "slug"], ["email"], ["adminName", "adminEmail"], []];
  const stepDone = (index: number) => fieldsOf[index].every(key => !problems[key]) && (index !== 0 || (slugCheck?.slug === draft.slug && slugCheck.ok));
  const shown = (key: keyof Draft) => (tried ? problems[key] : undefined);

  function next() {
    if (!stepDone(step)) return setTried(true);
    setTried(false);
    setStep(current => Math.min(STEPS.length - 1, current + 1));
  }

  function create() {
    const form = new FormData();
    for (const [key, value] of Object.entries(draft)) form.set(key, value);
    startCreating(async () => setResult(await createAgencyAction({}, form)));
  }

  /* ---------- Made ---------- */
  if (result && !result.error && result.agencyId) {
    return (
      <div className="wizard-step mx-auto max-w-3xl">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#153a32] via-[#1b4a3e] to-[#286b55] px-8 py-10 text-white shadow-[0_24px_60px_-28px_#0e2a24]">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#dcef98]/15 blur-2xl" aria-hidden="true" />
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#dcef98] text-[#173e35] shadow-lg"><Check className="h-7 w-7" strokeWidth={3} /></span>
          <h2 className="mt-5 text-3xl font-bold">{draft.name} is ready</h2>
          <p className="mt-2 max-w-xl text-white/70">
            Set up with the standard documents, shift patterns and note sections, on {trialText}
            {result.trialEndsOn ? ` until ${new Date(`${result.trialEndsOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}` : ""}.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 font-mono text-sm"><Globe2 className="h-4 w-4 text-[#dcef98]" /> {draft.slug}.{baseHost}</p>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="card p-6">
            {result.link ? (
              <>
                <p className="text-sm font-bold">Setup link for {draft.adminName}</p>
                <p className="mt-1 text-sm text-mute">They open it, choose a password, and land in {draft.name}. It works once, until {result.expires}.</p>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-[var(--color-ground)] p-1.5 pl-3.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">{result.link}</code>
                  <button
                    type="button"
                    className="btn-brand btn-sm shrink-0"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(result.link!);
                        setCopied(true);
                      } catch {
                        setCopied(false);
                      }
                    }}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                {result.emailed && <p className="mt-3 flex items-start gap-2 text-xs text-mute"><Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {result.emailed}</p>}
              </>
            ) : (
              <p className="text-sm text-mute">{result.note}</p>
            )}
          </section>
          <section className="card p-6">
            <p className="text-sm font-bold">What happens next</p>
            <ol className="mt-3 space-y-3 text-sm">
              {[`${draft.adminName.split(" ")[0]} chooses a password`, "They add homes, staff and the people they support", "Staff get their own setup links from them"].map((line, index) => (
                <li key={line} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky text-xs font-bold text-brand-deep">{index + 1}</span>
                  <span className="pt-0.5 text-mute">{line}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/owner/agencies/${result.agencyId}`} className="btn-brand"><ExternalLink className="h-4 w-4" /> Open {draft.name}</Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setResult(null);
              setDraft(EMPTY);
              setSlugEdited(false);
              setLegalEdited(false);
              setSlugCheck(null);
              setCopied(false);
              setStep(0);
            }}
          >
            <PlusCircle className="h-4 w-4" /> Add another agency
          </button>
        </div>
      </div>
    );
  }

  /* ---------- The steps ---------- */
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0">
        {/* Progress */}
        <ol className="mb-6 grid grid-cols-4 gap-2">
          {STEPS.map((item, index) => {
            const done = index < step;
            const here = index === step;
            return (
              <li key={item.title}>
                <button
                  type="button"
                  disabled={index > step}
                  onClick={() => setStep(index)}
                  className="group w-full text-left disabled:cursor-default"
                  aria-current={here ? "step" : undefined}
                >
                  <span className={cn("block h-1.5 rounded-full transition-all duration-500", done ? "bg-brand" : here ? "bg-gradient-to-r from-brand to-[#9fcf6a]" : "bg-[var(--color-panel)]")} />
                  <span className="mt-2.5 flex items-center gap-2">
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg transition", done ? "bg-brand text-white" : here ? "bg-[#dcef98] text-[#173e35]" : "bg-[var(--color-panel)] text-dim")}>
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <item.icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="hidden min-w-0 sm:block">
                      <span className={cn("block truncate text-[13px] font-semibold", here || done ? "text-ink" : "text-dim")}>{item.title}</span>
                      <span className="block truncate text-[11px] text-dim">{item.hint}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <form
          onSubmit={event => {
            event.preventDefault();
            if (step < STEPS.length - 1) next();
            else create();
          }}
          className="card overflow-hidden"
        >
          <div key={step} className="wizard-step p-6 sm:p-8">
            {step === 0 && (
              <div className="grid gap-5">
                <header>
                  <h2 className="text-xl font-bold">The agency</h2>
                  <p className="mt-1 text-sm text-mute">What staff will see, and where they will sign in.</p>
                </header>
                <Input label="Agency name" icon={Building2} autoFocus value={draft.name} onChange={event => set("name", event.target.value)} placeholder="Sunrise Care" maxLength={80} error={shown("name")} hint="The short name staff see in the app." />
                <Input
                  label="Legal name"
                  icon={ScrollText}
                  value={draft.legalName}
                  onChange={event => {
                    setLegalEdited(true);
                    set("legalName", event.target.value);
                  }}
                  placeholder="Sunrise Care Services LLC"
                  maxLength={160}
                  error={shown("legalName")}
                  hint="As printed on signed documents and state reports."
                />
                <div className="grid gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">Web address</span>
                  <span className={cn("flex items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-4", shown("slug") || (slugCheck?.slug === draft.slug && slugCheck && !slugCheck.ok) ? "border-flag/50 focus-within:ring-flag-soft" : "border-line focus-within:border-brand focus-within:ring-sky")}>
                    <Globe2 className="ml-3.5 h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
                    <input
                      value={draft.slug}
                      onChange={event => {
                        setSlugEdited(true);
                        set("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                      }}
                      maxLength={40}
                      className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 font-mono text-sm outline-none"
                      aria-label="Web address name"
                    />
                    <span className="shrink-0 border-l border-line bg-[var(--color-ground)] px-3 py-2.5 font-mono text-sm text-mute">.{baseHost}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs">
                    {!draft.slug ? (
                      <span className="text-mute">Fills in from the name. Lowercase letters, numbers and dashes; it cannot change later.</span>
                    ) : slugCheck?.slug !== draft.slug ? (
                      <span className="flex items-center gap-1.5 text-mute"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</span>
                    ) : slugCheck.ok ? (
                      <span className="flex items-center gap-1.5 font-semibold text-sage"><CheckCircle2 className="h-3.5 w-3.5" /> {draft.slug}.{baseHost} is available</span>
                    ) : (
                      <span className="flex items-center gap-1.5 font-semibold text-flag"><XCircle className="h-3.5 w-3.5" /> {slugCheck.message}</span>
                    )}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">Time zone</span>
                  <Select value={draft.timezone} onChange={value => set("timezone", value)} options={TIME_ZONES} aria-label="Time zone" />
                  <span className="text-xs text-mute">Every date and time in this agency uses it.</span>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-5">
                <header>
                  <h2 className="text-xl font-bold">Contact</h2>
                  <p className="mt-1 text-sm text-mute">Printed on documents and used for replies to the agency&apos;s emails. All of it can wait.</p>
                </header>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input label="Office phone" icon={Phone} optional value={draft.phone} onChange={event => set("phone", event.target.value)} placeholder="615-555-0100" maxLength={40} />
                  <Input label="Office email" icon={AtSign} optional type="email" value={draft.email} onChange={event => set("email", event.target.value)} placeholder="office@sunrisecare.com" maxLength={200} error={draft.email ? problems.email : undefined} hint="Replies to Mohuddle's emails go here." />
                </div>
                <Input label="Street address" icon={MapPin} optional value={draft.address} onChange={event => set("address", event.target.value)} placeholder="120 Main Street, Suite 4" maxLength={200} />
                <Input label="City, state and ZIP" icon={MapPin} optional value={draft.cityStateZip} onChange={event => set("cityStateZip", event.target.value)} placeholder="Nashville, TN 37203" maxLength={120} />
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-5">
                <header>
                  <h2 className="text-xl font-bold">First administrator</h2>
                  <p className="mt-1 text-sm text-mute">The person at the agency who sets everything up. They get a one-time link to choose a password.</p>
                </header>
                <Input label="Their name" icon={UserRound} autoFocus value={draft.adminName} onChange={event => set("adminName", event.target.value)} placeholder="Jordan Ellis" maxLength={120} error={shown("adminName")} />
                <Input label="Their email" icon={Mail} type="email" value={draft.adminEmail} onChange={event => set("adminEmail", event.target.value)} placeholder="jordan@sunrisecare.com" maxLength={200} error={shown("adminEmail")} hint="If they already sign in to Mohuddle for another agency, they keep their password." />
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-5">
                <header>
                  <h2 className="text-xl font-bold">Check and create</h2>
                  <p className="mt-1 text-sm text-mute">The web address cannot change later. Everything else can.</p>
                </header>
                <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                  {[
                    { step: 0, rows: [["Agency", draft.name], ["Legal name", draft.legalName], ["Web address", `${draft.slug}.${baseHost}`], ["Time zone", `${zoneLabel} time`]] },
                    { step: 1, rows: [["Phone", draft.phone || "Not given"], ["Office email", draft.email || "Not given"], ["Address", [draft.address, draft.cityStateZip].filter(Boolean).join(", ") || "Not given"]] },
                    { step: 2, rows: [["Administrator", `${draft.adminName} · ${draft.adminEmail}`]] },
                  ].map(section => (
                    <div key={section.step} className="flex gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {section.rows.map(([term, value]) => (
                          <div key={term} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 text-sm">
                            <dt className="text-mute">{term}</dt>
                            <dd className={cn("truncate font-medium", term === "Web address" && "font-mono", value === "Not given" && "font-normal text-dim")}>{value}</dd>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setStep(section.step)} className="self-start text-xs font-semibold text-brand hover:text-brand-deep">Change</button>
                    </div>
                  ))}
                </dl>
                {result?.error && <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">{result.error}</p>}
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-line bg-[var(--color-ground)] px-6 py-4 sm:px-8">
            {step > 0 ? (
              <button type="button" onClick={() => setStep(current => current - 1)} className="btn-ghost btn-sm"><ArrowLeft className="h-4 w-4" /> Back</button>
            ) : (
              <span className="text-xs text-dim">Step 1 of {STEPS.length}</span>
            )}
            {step < STEPS.length - 1 ? (
              <button type="submit" className="btn-brand">Continue <ArrowRight className="h-4 w-4" /></button>
            ) : (
              <button type="submit" disabled={creating} className="btn-brand disabled:opacity-60">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {creating ? "Creating…" : "Create the agency"}
              </button>
            )}
          </footer>
        </form>
      </div>

      {/* The agency's card, built as it is typed. */}
      <aside className="xl:sticky xl:top-8 xl:self-start">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-dim">Preview</p>
        <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_18px_40px_-24px_#173e3555]">
          <div className="relative bg-gradient-to-br from-[#153a32] to-[#286b55] px-6 pb-12 pt-6 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#dcef98]/20 blur-2xl" aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">New agency</p>
            <p className="mt-1 truncate text-lg font-bold">{draft.name || "Agency name"}</p>
            <p className="truncate text-xs text-white/60">{draft.legalName || "Legal name"}</p>
          </div>
          <div className="relative z-10 -mt-7 px-6">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border-4 border-white bg-[#dcef98] font-display text-lg font-bold text-[#173e35] shadow-md">{initialsOf(draft.name)}</span>
          </div>
          <dl className="space-y-3 px-6 pb-6 pt-4 text-sm">
            <div className="flex items-center gap-2.5"><Globe2 className="h-4 w-4 shrink-0 text-dim" /><span className="truncate font-mono text-[13px]">{draft.slug || "web-address"}.{baseHost}</span></div>
            <div className="flex items-center gap-2.5"><Clock3 className="h-4 w-4 shrink-0 text-dim" /><span>{zoneLabel} time</span></div>
            <div className="flex items-center gap-2.5"><UserRound className="h-4 w-4 shrink-0 text-dim" /><span className="truncate">{draft.adminName || "First administrator"}</span></div>
            <div className="flex items-center gap-2.5"><Sparkles className="h-4 w-4 shrink-0 text-dim" /><span>{trialText[0].toUpperCase() + trialText.slice(1)}</span></div>
          </dl>
          <div className="border-t border-line bg-[var(--color-ground)] px-6 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">Starts with</p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-mute">
              {["40 standard document types", "Standard documents to sign", "5 shift patterns", "Daily-note sections"].map(line => (
                <li key={line} className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-sage" /> {line}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs text-dim">Nothing is copied from any other agency. The administrator can change all of it.</p>
      </aside>
    </div>
  );
}
