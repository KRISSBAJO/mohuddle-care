"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, CheckCircle2, FileSignature, Loader2, PenLine, ShieldCheck, Type } from "lucide-react";
import { cn } from "@/lib/cn";
import { needsAction, type SignField } from "@/lib/sign-fields";
import { initialsOf, type Section } from "@/lib/signing";
import { PdfPages } from "./PdfPages";
import { SIGNATURE_FONTS, SignaturePad, typedToPng, type PadHandle } from "./SignaturePad";

type Props = {
  itemId: string;
  token: string | null;
  title: string;
  signerName: string;
  signerRelation: string;
  agency: string;
  /* The agency's time zone, for the signing date. */
  zone: string;
  initialEach: boolean;
  content: { kind: "text"; sections: Section[] } | { kind: "pdf"; pages: number; sourceUrl: string; fields?: SignField[] };
  doneHref?: string;
};

type Adopted = { method: "drawn" | "typed"; signature: string; initials: string; typedInitials: string };

/*
 * Signing, step by step, the way people know from DocuSign: agree to sign electronically, adopt a
 * signature and initials (drawn or typed in a handwriting style), initial each section or page, sign,
 * finish. A "Next" button always jumps to whatever still needs doing.
 */
export function SignDocument(props: Props) {
  const { content, initialEach } = props;
  const [step, setStep] = useState<"consent" | "adopt" | "sign" | "done">("consent");
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [adopted, setAdopted] = useState<Adopted | null>(null);
  const [initialled, setInitialled] = useState<Set<number>>(new Set());
  const [signed, setSigned] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A PDF with placed fields: the signer taps each signature and initials field where it sits on the page.
  const placed = useMemo(() => (content.kind === "pdf" ? content.fields ?? [] : []), [content]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const toApply = useMemo(() => placed.filter(needsAction), [placed]);
  const fieldsLeft = useMemo(() => toApply.filter(field => !applied.has(field.id)), [toApply, applied]);
  const total = content.kind === "text" ? content.sections.length : content.pages;
  const needed = placed.length ? 0 : initialEach ? total : 0;
  const remaining = useMemo(() => Array.from({ length: needed }, (_, index) => index).filter(index => !initialled.has(index)), [needed, initialled]);
  const complete = placed.length ? fieldsLeft.length === 0 : remaining.length === 0 && signed;

  const goNext = () => {
    const target = placed.length ? (fieldsLeft.length ? `field-${fieldsLeft[0].id}` : "finish-here") : remaining.length ? `initial-${remaining[0]}` : "sign-here";
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  async function finish() {
    if (!adopted || !consentAt) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: props.itemId,
        token: props.token,
        method: adopted.method,
        typedName: adopted.method === "typed" ? props.signerName : "",
        typedInitials: adopted.typedInitials,
        signature: adopted.signature,
        initials: adopted.initials,
        initialsCount: placed.length ? placed.filter(field => field.kind === "initials").length : initialled.size,
        appliedFields: [...applied],
        consent: true,
        consentedAt: consentAt,
      }),
    }).catch(() => null);
    setPending(false);
    const body = response ? await response.json().catch(() => ({})) : { error: "The connection dropped. Try again." };
    if (!response?.ok || body.error) return setError(body.error ?? "The document could not be signed. Try again.");
    setStep("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (step === "done") {
    return (
      <div className="card mx-auto max-w-xl px-6 py-12 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-sage" />
        <h2 className="mt-4 text-2xl font-bold">Signed. Thank you.</h2>
        <p className="mt-2 text-sm text-mute">{props.title} has been signed and filed with {props.agency}. A copy with a signing certificate is kept on record.</p>
        {props.doneHref && <a href={props.doneHref} className="btn-brand mt-6 inline-flex">Back</a>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <ol className="mb-6 grid grid-cols-3 gap-2 text-xs font-semibold">
        {[
          ["consent", "Agree to sign online"],
          ["adopt", "Your signature"],
          ["sign", initialEach ? "Initial and sign" : "Sign"],
        ].map(([key, text], index) => {
          const order = ["consent", "adopt", "sign"].indexOf(step);
          const done = index < order;
          return (
            <li key={key} className={cn("flex items-center gap-2 rounded-xl px-3 py-2", index === order ? "bg-brand text-white" : done ? "bg-sage-soft text-sage" : "bg-panel text-mute")}>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white/25 text-[11px]">{done ? "✓" : index + 1}</span> {text}
            </li>
          );
        })}
      </ol>

      {step === "consent" && (
        <section className="card p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-5 w-5 text-brand" /> Signing electronically</h2>
          <div className="mt-3 space-y-2 text-sm text-mute">
            <p>You are about to sign <strong className="text-ink">{props.title}</strong> as <strong className="text-ink">{props.signerName}</strong>{props.signerRelation ? ` (${props.signerRelation})` : ""}.</p>
            <p>Your electronic signature and initials have the same effect as signing on paper. The signed copy, with the date, time, your device and internet address, is kept by {props.agency}. You can ask them for a copy, or ask to sign on paper instead, at any time.</p>
          </div>
          <label className="mt-5 flex items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1b6fa8]" checked={Boolean(consentAt)} onChange={event => setConsentAt(event.target.checked ? new Date().toISOString() : null)} />
            I agree to use electronic records and signatures, and I am {props.signerName}.
          </label>
          <div className="mt-5 flex justify-end">
            <button type="button" disabled={!consentAt} onClick={() => setStep("adopt")} className="btn-brand disabled:opacity-50">Continue</button>
          </div>
        </section>
      )}

      {step === "adopt" && <AdoptSignature name={props.signerName} onAdopt={value => { setAdopted(value); setStep("sign"); setTimeout(goNext, 300); }} />}

      {step === "sign" && adopted && (
        <>
          <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
            <p className="text-sm">
              {placed.length ? (
                <span className="font-semibold">{toApply.length - fieldsLeft.length} of {toApply.length} places done</span>
              ) : (
                <>
                  {initialEach && <span className="font-semibold">{initialled.size} of {needed} initialled</span>}
                  {initialEach && " · "}
                  <span className={signed ? "font-semibold text-sage" : "text-mute"}>{signed ? "Signed" : "Signature needed"}</span>
                </>
              )}
            </p>
            {!complete ? (
              <button type="button" onClick={goNext} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-ink shadow-sm hover:brightness-95">
                <ArrowDown className="h-4 w-4" /> Next
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={finish} className="btn-brand">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} {pending ? "Signing…" : "Finish"}
              </button>
            )}
          </div>

          <article className="card px-5 py-8 sm:px-10">
            <p className="text-xs font-semibold uppercase tracking-wider text-mute">{props.agency}</p>
            <h1 className="mt-2 text-2xl font-bold">{props.title}</h1>
            {content.kind === "text" ? (
              <div className="mt-6 space-y-6">
                {content.sections.map((section, index) => (
                  <section key={index} className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                    <div>
                      {section.heading && <h2 className="mb-1.5 text-base font-bold">{section.heading}</h2>}
                      <p className="whitespace-pre-line text-[15px] leading-relaxed">{section.text}</p>
                    </div>
                    {initialEach && <InitialBox index={index} initials={adopted.initials} done={initialled.has(index)} onApply={() => setInitialled(new Set(initialled).add(index))} />}
                  </section>
                ))}
              </div>
            ) : placed.length ? (
              <div className="mt-6">
                <p className="mb-3 text-sm text-mute">Read each page. Tap every highlighted place to initial or sign; the date and your name are filled in for you.</p>
                <PdfPages
                  url={content.sourceUrl}
                  overlay={number =>
                    placed
                      .filter(field => field.page === number)
                      .map(field => {
                        const box = { left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.w * 100}%`, height: `${field.h * 100}%` };
                        if (!needsAction(field)) {
                          return (
                            <span key={field.id} className="absolute flex items-center overflow-hidden whitespace-nowrap rounded bg-sky/40 px-1 text-[clamp(8px,1.4vw,13px)] font-semibold text-[#0b2239]" style={box}>
                              {field.kind === "date" ? new Intl.DateTimeFormat("en-US", { timeZone: props.zone, month: "long", day: "numeric", year: "numeric" }).format(new Date()) : props.signerName}
                            </span>
                          );
                        }
                        const done = applied.has(field.id);
                        return (
                          <button
                            key={field.id}
                            id={`field-${field.id}`}
                            type="button"
                            disabled={done}
                            onClick={() => setApplied(current => new Set(current).add(field.id))}
                            className={cn("absolute flex scroll-mt-32 items-center justify-center rounded-md border-2 text-[clamp(8px,1.3vw,12px)] font-bold transition", done ? "border-transparent bg-transparent" : "animate-pulse border-accent bg-accent-soft/90 text-ink hover:animate-none")}
                            style={box}
                          >
                            {done ? (
                              // eslint-disable-next-line @next/next/no-img-element -- the signer's own signature or initials
                              <img src={field.kind === "signature" ? adopted.signature : adopted.initials} alt={field.kind === "signature" ? "Your signature" : "Your initials"} className="h-full w-full object-contain" />
                            ) : (
                              <span className="inline-flex items-center gap-1"><PenLine className="h-3 w-3" /> {field.kind === "signature" ? "Sign" : "Initial"}</span>
                            )}
                          </button>
                        );
                      })
                  }
                />
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <iframe src={content.sourceUrl} title={props.title} className="h-[70vh] w-full rounded-xl border border-line bg-panel" />
                {initialEach && (
                  <div>
                    <p className="mb-2 text-sm text-mute">Read every page, then initial each one.</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {Array.from({ length: content.pages }, (_, index) => (
                        <div key={index} className="rounded-xl border border-line p-2 text-center">
                          <p className="mb-1 text-xs font-semibold text-mute">Page {index + 1}</p>
                          <InitialBox index={index} initials={adopted.initials} done={initialled.has(index)} onApply={() => setInitialled(new Set(initialled).add(index))} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!placed.length && (
            <div id="sign-here" className="mt-10 scroll-mt-28 border-t border-line pt-6">
              <p className="mb-2 text-sm font-semibold">Signature</p>
              <button
                type="button"
                disabled={remaining.length > 0}
                onClick={() => setSigned(true)}
                className={cn(
                  "flex h-28 w-full max-w-md items-center justify-center rounded-xl border-2 transition",
                  signed ? "border-sage/40 bg-white" : remaining.length ? "border-dashed border-line bg-panel/40 text-dim" : "animate-pulse border-accent bg-accent-soft text-ink",
                )}
              >
                {signed ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the signer's own signature, drawn moments ago
                  <img src={adopted.signature} alt="Your signature" className="max-h-24 max-w-[90%] object-contain" />
                ) : (
                  <span className="inline-flex items-center gap-2 text-sm font-bold"><PenLine className="h-4 w-4" /> {remaining.length ? `Initial ${remaining.length} more first` : "Sign here"}</span>
                )}
              </button>
              <p className="mt-2 text-sm font-semibold">{props.signerName}{props.signerRelation ? `, ${props.signerRelation}` : ""}</p>
              <p className="text-xs text-mute">{new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: props.zone }).format(new Date())}</p>
            </div>
            )}
            {error && <p className="mt-4 rounded-lg bg-flag-soft px-3 py-2 text-sm font-medium text-flag" role="alert">{error}</p>}
            {complete && (
              <div id="finish-here" className="mt-6 flex justify-end">
                <button type="button" disabled={pending} onClick={finish} className="btn-brand">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} {pending ? "Signing…" : "Finish and sign"}
                </button>
              </div>
            )}
          </article>
        </>
      )}
    </div>
  );
}

function InitialBox({ index, initials, done, onApply }: { index: number; initials: string; done: boolean; onApply: () => void }) {
  return (
    <button
      id={`initial-${index}`}
      type="button"
      onClick={onApply}
      disabled={done}
      className={cn("flex h-14 w-full scroll-mt-28 flex-col items-center justify-center rounded-lg border-2 text-xs font-bold transition", done ? "border-sage/40 bg-white" : "border-accent bg-accent-soft text-ink hover:brightness-95")}
    >
      {done ? (
        // eslint-disable-next-line @next/next/no-img-element -- the signer's own initials
        <img src={initials} alt="Your initials" className="max-h-9 max-w-[85%] object-contain" />
      ) : (
        <>
          <PenLine className="h-3.5 w-3.5" /> Initial
        </>
      )}
    </button>
  );
}

/* Draw a signature and initials, or type them and pick a handwriting style. */
function AdoptSignature({ name, onAdopt }: { name: string; onAdopt: (value: Adopted) => void }) {
  const [mode, setMode] = useState<"type" | "draw">("type");
  const [font, setFont] = useState<string>(SIGNATURE_FONTS[0].family);
  const [initials, setInitials] = useState(initialsOf(name));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signaturePad = useRef<PadHandle>(null);
  const initialsPad = useRef<PadHandle>(null);
  const [drawnEmpty, setDrawnEmpty] = useState({ signature: true, initials: true });

  useEffect(() => {
    Promise.all(SIGNATURE_FONTS.map(option => document.fonts.load(`40px "${option.family}"`))).finally(() => setReady(true));
  }, []);

  async function adopt() {
    setError(null);
    if (mode === "type") {
      const clean = initials.replace(/[^A-Za-z.]/g, "").slice(0, 4);
      if (!clean) return setError("Enter your initials.");
      const [signature, initialsPng] = await Promise.all([typedToPng(name, font), typedToPng(clean, font)]);
      if (!signature || !initialsPng) return setError("Your browser could not draw the signature. Try drawing it instead.");
      return onAdopt({ method: "typed", signature, initials: initialsPng, typedInitials: clean });
    }
    const signature = signaturePad.current?.toPng();
    const initialsPng = initialsPad.current?.toPng();
    if (!signature) return setError("Draw your signature.");
    if (!initialsPng) return setError("Draw your initials.");
    onAdopt({ method: "drawn", signature, initials: initialsPng, typedInitials: "" });
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-bold">Adopt your signature</h2>
      <p className="mt-1 text-sm text-mute">This is how your signature and initials will appear. You can type them in a handwriting style or draw them.</p>
      <div className="mt-4 inline-flex rounded-xl bg-panel p-1">
        {[
          ["type", "Type", Type],
          ["draw", "Draw", PenLine],
        ].map(([value, text, Icon]) => (
          <button key={value as string} type="button" onClick={() => setMode(value as "type" | "draw")} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold", mode === value ? "bg-white shadow-sm" : "text-mute")}>
            <Icon className="h-4 w-4" /> {text as string}
          </button>
        ))}
      </div>

      {mode === "type" ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <div>
              <p className="label">Full name</p>
              <p className="field bg-panel/60">{name}</p>
            </div>
            <div>
              <label htmlFor="sig-initials" className="label">Initials</label>
              <input id="sig-initials" value={initials} maxLength={4} onChange={event => setInitials(event.target.value.toUpperCase())} className="field" />
            </div>
          </div>
          <fieldset>
            <legend className="label">Style</legend>
            <div className={cn("grid gap-2 sm:grid-cols-2", !ready && "opacity-50")}>
              {SIGNATURE_FONTS.map(option => (
                <label key={option.family} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-sky/40">
                  <input type="radio" name="sig-font" value={option.family} checked={font === option.family} onChange={() => setFont(option.family)} className="sr-only" />
                  <span className="truncate text-3xl text-[#0b2239]" style={{ fontFamily: `"${option.family}"` }}>{name}</span>
                  <span className="shrink-0 text-2xl text-[#0b2239]" style={{ fontFamily: `"${option.family}"` }}>{initials}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_14rem]">
          <div>
            <p className="label">Signature</p>
            <SignaturePad ref={signaturePad} label="Sign here with your finger, pen or mouse" onChange={empty => setDrawnEmpty(value => ({ ...value, signature: empty }))} />
          </div>
          <div>
            <p className="label">Initials</p>
            <SignaturePad ref={initialsPad} label="Initials" onChange={empty => setDrawnEmpty(value => ({ ...value, initials: empty }))} />
          </div>
        </div>
      )}
      <p className="mt-5 text-xs text-mute">By selecting Adopt and continue, I agree that this signature and these initials are the electronic form of my signature and initials, for all purposes on this document, the same as pen-and-paper.</p>
      {error && <p className="mt-3 rounded-lg bg-flag-soft px-3 py-2 text-sm font-medium text-flag" role="alert">{error}</p>}
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={adopt} disabled={mode === "type" ? !ready : drawnEmpty.signature || drawnEmpty.initials} className="btn-brand disabled:opacity-50">Adopt and continue</button>
      </div>
    </section>
  );
}
