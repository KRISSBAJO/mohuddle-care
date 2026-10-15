import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, HeartPulse, Lock, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";
import { DemoForm } from "@/components/mohuddle/DemoForm";
import { Motion } from "@/components/mohuddle/Motion";
import { AlertsScene } from "@/components/mohuddle/AlertsScene";
import { Bento } from "@/components/mohuddle/Bento";
import { PrivacyFlow } from "@/components/mohuddle/PrivacyFlow";
import { ScribeDemo } from "@/components/mohuddle/ScribeDemo";
import { ScribeStory } from "@/components/mohuddle/ScribeStory";
import { day, product, questions, roles } from "@/lib/product";

export const metadata: Metadata = {
  title: { absolute: `${product.name} | ${product.tagline}` },
  description: product.description,
  openGraph: { title: product.name, description: product.description, type: "website" },
};


/* A delay for things that appear one after another. */
const delay = (index: number, step = 90) => ({ "--d": `${index * step}ms` }) as React.CSSProperties;

/* Product facts that count up. True of the product itself, not claims about customers. */
const FACTS = [
  { count: 2, suffix: " min", label: "to a spoken, signed note" },
  { count: 30, suffix: " s", label: "shift huddle at clock-in" },
  { count: 9, suffix: "", label: "modules in one place" },
  { count: 0, suffix: "", label: "recordings ever saved" },
];

const NAV = [
  ["#scribe", "Scribe"],
  ["#product", "Product"],
  ["#day", "A day with Mohuddle"],
  ["#trust", "Privacy"],
] as const;

/* Mohuddle's own home page, separate from any agency's website. */
export default function MohuddleHome() {
  const headline = ["Care", "notes", "that"];
  return (
    <>
      <Motion />
      <header className="mh-header sticky top-0 z-40 border-b border-transparent bg-[#f7f7ef]/80 text-[#173e35] backdrop-blur transition">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3.5 sm:px-6">
          <Link href="/mohuddle" className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight">{product.name}</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-6 text-sm text-[#5b6b62] md:flex" aria-label="Mohuddle">
            {NAV.map(([href, text]) => <a key={href} href={href} className="mh-link hover:text-[#173e35]">{text}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href={product.signInHref} className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-[#173e35]/80 hover:text-[#173e35] sm:px-4">Sign in</Link>
            <a href="#demo" className="mh-shine whitespace-nowrap rounded-full bg-[#173e35] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#0f2c25] sm:px-4">Book a demo</a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="mh-hero relative overflow-hidden text-[#173e35]">
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.08fr_1fr] lg:pb-28 lg:pt-20">
            <div>
              <p className="mh-rise inline-flex items-center gap-2 rounded-full border border-[#d5e2c3] bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-[#377658]" style={delay(0)}>
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#dcef98]"><Sparkles className="h-3 w-3 text-[#173e35]" /></span> New: speak your notes
              </p>
              <h1 className="mh-title mt-7">
                {headline.map((word, index) => (
                  <span key={word}><span className="mh-word" style={delay(index + 1, 110)}>{word}</span>{" "}</span>
                ))}
                <span className="mh-title-em">
                  <span className="mh-word" style={delay(4, 110)}>write</span>{" "}
                  <span className="mh-word relative" style={delay(5, 110)}>
                    themselves.
                    <svg className="mh-underline" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M4 14 C 70 4, 150 4, 296 11" />
                    </svg>
                  </span>
                </span>
              </h1>
              <p className="mh-rise mt-7 max-w-[30rem] text-lg leading-relaxed text-[#4c5d55]" style={delay(7, 110)}>
                Staff talk through the shift for two minutes. Mohuddle fills in the note; they check it and sign. Medications, time clock, incidents, reviews and payroll run here too.
              </p>
              <div className="mh-rise mt-9 flex flex-wrap items-center gap-3" style={delay(8, 110)}>
                <a href="#demo" className="mh-shine group inline-flex items-center gap-3 rounded-full bg-[#173e35] py-2 pl-6 pr-2 font-semibold text-white shadow-[0_14px_30px_-12px_rgba(23,62,53,.55)] transition hover:-translate-y-0.5 hover:bg-[#0f2c25]">
                  Book a demo
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#dcef98] text-[#173e35] transition group-hover:translate-x-1"><ArrowRight className="h-4 w-4" /></span>
                </a>
                <a href="#scribe" className="inline-flex items-center gap-2 rounded-full border border-[#cfdac6] bg-white px-6 py-3.5 font-semibold transition hover:-translate-y-0.5 hover:border-[#377658]"><Mic className="h-4 w-4 text-[#377658]" /> See the scribe</a>
              </div>
              <ul className="mh-rise mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[#67766c]" style={delay(9, 110)}>
                <li className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-[#377658]" /> Voice stays on your server</li>
                <li className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#377658]" /> Every edit recorded</li>
                <li className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-[#377658]" /> EVV-ready time clock</li>
              </ul>
            </div>
            <div className="mh-rise relative" style={delay(5, 120)}>
              <div className="mh-stage mh-float" data-tilt>
                <ScribeDemo />
              </div>
              <div className="mh-stamp" aria-hidden="true">
                <strong>2 min</strong>
                <span>to a signed note</span>
              </div>
            </div>
          </div>
        </section>

        <div className="mh-marquee border-y border-[#e3e8dc] bg-white py-4" aria-hidden="true">
          <div className="mh-marquee-track">
            {[0, 1].map(copy => (
              <div key={copy} className="flex shrink-0 items-center gap-10 pr-10">
                {["Speak your note", "Shift huddle", "Medications", "Time clock and EVV", "Incidents and Tier 1", "Note review", "Plan goals", "Weight chart", "Documents and signing", "Phone alerts", "Ask Mohuddle"].map(item => (
                  <span key={item} className="flex items-center gap-10 whitespace-nowrap text-lg font-semibold text-[#173e35]/70">
                    {item}
                    <Sparkles className="h-4 w-4 text-[#9cc63b]" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section className="bg-white py-14">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 sm:px-6 lg:grid-cols-4">
            {FACTS.map((fact, index) => (
              <div key={fact.label} data-reveal style={delay(index)} className="mh-reveal">
                <p className="font-display text-5xl font-bold tracking-[-0.04em] text-[#173e35] tabular-nums sm:text-6xl">
                  <span data-count={fact.count} data-suffix={fact.suffix}>{fact.count}{fact.suffix}</span>
                </p>
                <p className="mt-1 text-sm text-[#67766c]">{fact.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="scribe" className="scroll-mt-20 bg-[#f7f8f5] pt-20 sm:pt-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p data-reveal className="mh-reveal text-sm font-bold uppercase tracking-[0.18em] text-[#286b55]">The scribe</p>
            <h2 data-reveal style={delay(1)} className="mh-reveal mt-3 max-w-3xl font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35] sm:text-6xl">Two minutes of talking instead of thirty minutes of typing.</h2>
            <ScribeStory />
          </div>
        </section>

        <section className="bg-[#f7f8f5] pb-20 sm:pb-28">
          <div data-reveal className="mh-reveal mx-auto max-w-6xl px-4 sm:px-6">
            <PrivacyFlow />
          </div>
        </section>

        <section id="product" className="scroll-mt-20 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div data-reveal className="mh-reveal">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#286b55]">One place for the whole agency</p>
                <h2 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35] sm:text-5xl">Everything your homes run on.</h2>
              </div>
              <p data-reveal style={delay(1)} className="mh-reveal max-w-sm text-[#5b6b7a]">Built with providers who support people with intellectual and developmental disabilities, around the forms and reviews they already answer to.</p>
            </div>
            <div className="mt-12">
              <Bento />
            </div>
          </div>
        </section>

        <section id="day" className="scroll-mt-20 bg-[#f7f8f5] py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p data-reveal className="mh-reveal text-center text-sm font-bold uppercase tracking-[0.18em] text-[#286b55]">A day with Mohuddle</p>
            <h2 data-reveal style={delay(1)} className="mh-reveal mx-auto mt-3 max-w-3xl text-center font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35] sm:text-5xl">From clock-in to payroll, nothing falls through.</h2>
            <ol data-reveal className="mh-day relative mt-14 grid gap-8 md:grid-cols-4">
              <span className="mh-day-line absolute left-0 right-0 top-5 hidden h-0.5 rounded-full bg-[#9cc63b] md:block" aria-hidden="true" />
              {day.map((step, i) => (
                <li key={step.when} className="mh-day-step relative" style={delay(i + 2, 220)}>
                  <span className="relative grid h-10 w-10 place-items-center rounded-full border-4 border-[#f7f8f5] bg-[#286b55] text-sm font-bold text-white">{i + 1}</span>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#8a9a90]">{step.when}</p>
                  <h3 className="mt-1 text-lg font-bold text-[#173e35]">{step.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[#5b6b7a]">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-white py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:items-center">
            <div data-reveal className="mh-reveal">
              <AlertsScene />
            </div>
            <div>
              <div data-reveal className="mh-reveal">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#286b55]">For everyone on the team</p>
                <h2 className="mt-3 font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35] sm:text-5xl">Each person sees their own work.</h2>
                <p className="mt-4 leading-relaxed text-[#5b6b7a]">Reminders reach the right phone at the right time: shifts, breaks, late doses and notes sent back. Who is told about what is a setting, not a phone call.</p>
              </div>
              <div className="mt-8 divide-y divide-[#e3e9df] border-y border-[#e3e9df]">
                {roles.map((role, index) => (
                  <div key={role.who} data-reveal style={delay(index, 110)} className="mh-reveal flex gap-4 py-4">
                    <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-[#286b55]" />
                    <div>
                      <h3 className="font-bold text-[#173e35]">{role.who}</h3>
                      <p className="mt-0.5 text-[15px] leading-relaxed text-[#5b6b7a]">{role.what}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="trust" className="scroll-mt-20 bg-[#eef3e6] py-20 text-[#173e35] sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 data-reveal className="mh-reveal max-w-3xl font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">Ready for the reviewer, the auditor and the state.</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                ["Every change has a name", "Notes are signed electronically. Edits after signing keep the before and after, who made them and why."],
                ["Deadlines watch themselves", "Tier 1 incidents count down to the DIDD deadline. Late doses, overdue notes and no-shows reach the right people."],
                ["Your rules, not ours", "Clock-in allowances, required checks, note sections, review flags and who is told: all settings an admin changes."],
              ].map(([title, text], index) => (
                <div key={title} data-reveal style={delay(index, 140)} className="mh-reveal mh-card rounded-3xl bg-white p-7 ring-1 ring-[#dde6d3]">
                  <span className="mh-pop grid h-11 w-11 place-items-center rounded-2xl bg-[#dcef98]"><ShieldCheck className="h-5 w-5 text-[#173e35]" /></span>
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-2 leading-relaxed text-[#5b6b62]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f7f8f5] py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 data-reveal className="mh-reveal text-center font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35]">Questions agencies ask</h2>
            <div data-reveal style={delay(1)} className="mh-reveal mt-10 divide-y divide-[#dfe7db] rounded-3xl bg-white px-6">
              {questions.map(item => (
                <details key={item.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#173e35]">
                    {item.q}
                    <span className="text-xl text-[#286b55] transition group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-3 leading-relaxed text-[#5b6b7a]">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="mh-hero relative scroll-mt-20 overflow-hidden py-20 text-[#173e35] sm:py-28">
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
            <div data-reveal className="mh-reveal">
              <h2 className="mh-title text-[clamp(40px,4.6vw,60px)]">See your agency on <span className="mh-title-em">Mohuddle.</span></h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-[#4c5d55]">A 30-minute walk-through with your own homes, forms and rules in mind. Bring a supervisor and a DSP: they will see the scribe write a note.</p>
            </div>
            <div data-reveal style={delay(2)} className="mh-reveal">
              <DemoForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="mh-footer relative overflow-hidden bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 pb-14 pt-20 sm:px-6 sm:pb-20 sm:pt-24 md:flex-row md:justify-between">
          <Link href="/mohuddle" className="flex items-center gap-2.5 text-[#173e35]">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-semibold tracking-tight">{product.name}</span>
          </Link>
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-[#5b6b62]" aria-label="Footer">
            {NAV.map(([href, text]) => <a key={href} href={href} className="mh-link hover:text-[#173e35]">{text}</a>)}
            <a href="#demo" className="mh-link hover:text-[#173e35]">Book a demo</a>
            <Link href={product.signInHref} className="mh-link hover:text-[#173e35]">Sign in</Link>
          </nav>
          <p className="text-sm text-[#67766c]">© 2026 {product.name}. Care, organised.</p>
        </div>
        <p data-reveal className="mh-wordmark" aria-hidden="true">{product.name}</p>
      </footer>
    </>
  );
}
