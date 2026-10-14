import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, CalendarDays, CheckCheck, Clock, FileSignature, HeartPulse, Lock, Mic, NotebookPen, Pill, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";
import { DemoForm } from "@/components/mohuddle/DemoForm";
import { ScribeDemo } from "@/components/mohuddle/ScribeDemo";
import { day, features, product, questions, roles, type Feature } from "@/lib/product";

export const metadata: Metadata = {
  title: { absolute: `${product.name} | ${product.tagline}` },
  description: product.description,
  openGraph: { title: product.name, description: product.description, type: "website" },
};

const icons: Record<Feature["icon"], typeof Pill> = { notes: NotebookPen, pill: Pill, clock: Clock, alert: AlertTriangle, check: CheckCheck, user: UserRound, file: FileSignature, calendar: CalendarDays, bell: Bell };

/* Mohuddle's own home page, separate from any agency's website. */
export default function MohuddleHome() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0f2c25]/90 text-white backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3.5 sm:px-6">
          <Link href="/mohuddle" className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight">{product.name}</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-6 text-sm text-white/70 md:flex" aria-label="Mohuddle">
            <a href="#scribe" className="hover:text-white">Scribe</a>
            <a href="#product" className="hover:text-white">Product</a>
            <a href="#day" className="hover:text-white">A day with Mohuddle</a>
            <a href="#trust" className="hover:text-white">Privacy</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href={product.signInHref} className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-white/80 hover:text-white sm:px-4">Sign in</Link>
            <a href="#demo" className="whitespace-nowrap rounded-full bg-[#dcef98] px-3.5 py-2 text-sm font-bold text-[#0f2c25] hover:bg-[#cde486] sm:px-4">Book a demo</a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="mh-hero relative overflow-hidden bg-[#0f2c25] text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[#dcef98]/30 bg-[#dcef98]/10 px-3.5 py-1.5 text-xs font-semibold text-[#dcef98]">
                <Sparkles className="h-3.5 w-3.5" /> New: speak your notes
              </p>
              <h1 className="mt-6 font-display text-[44px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[68px]">
                Care notes that <span className="text-[#dcef98]">write themselves.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
                Staff talk through the shift for two minutes. Mohuddle fills in the note, they check it and sign. The rest of the agency runs here too: medications, time clock, incidents, reviews and payroll.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#demo" className="inline-flex items-center gap-2 rounded-full bg-[#dcef98] px-6 py-3.5 font-bold text-[#0f2c25] hover:bg-[#cde486]">Book a demo <ArrowRight className="h-4 w-4" /></a>
                <a href="#scribe" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3.5 font-semibold hover:bg-white/10"><Mic className="h-4 w-4" /> See the scribe</a>
              </div>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
                <li className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-[#dcef98]" /> Voice stays on your server</li>
                <li className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#dcef98]" /> Every edit recorded</li>
                <li className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-[#dcef98]" /> EVV-ready time clock</li>
              </ul>
            </div>
            <ScribeDemo />
          </div>
        </section>

        <section id="scribe" className="scroll-mt-20 bg-[#f7f8f5] py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#286b55]">The scribe</p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35] sm:text-5xl">Two minutes of talking instead of thirty minutes of typing.</h2>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {[
                ["1", "Speak", "Tap Start speaking and tell it like you would tell the next shift. A checklist on screen reminds you: meals, meds, goals, behaviour, sleep, family."],
                ["2", "Check", "Your words become the note: meals in meals, behaviour in behaviour, a summary at the end. Filled parts are highlighted, and it says what you did not mention."],
                ["3", "Sign", "Change anything that is wrong and sign it yourself. The AI never signs, never overwrites what you typed, and supervisors still review it."],
              ].map(([n, title, text]) => (
                <div key={n} className="rounded-3xl bg-white p-7 shadow-[0_1px_0_rgba(23,62,53,.06),0_20px_40px_-28px_rgba(23,62,53,.35)]">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#173e35] font-bold text-[#dcef98]">{n}</span>
                  <h3 className="mt-5 text-xl font-bold text-[#173e35]">{title}</h3>
                  <p className="mt-2 leading-relaxed text-[#5b6b7a]">{text}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-5 rounded-3xl bg-[#173e35] p-7 text-white md:grid-cols-[1fr_2fr] md:items-center sm:p-9">
              <p className="font-display text-2xl font-bold">Private by design</p>
              <p className="leading-relaxed text-white/75">Speech is turned into words and the note is drafted on your own server. The recording is never saved, and nothing is sent to another company. Names of the people you support, staff and medications are passed as hints, so they are spelled right.</p>
            </div>
          </div>
        </section>

        <section id="product" className="scroll-mt-20 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#286b55]">One place for the whole agency</p>
                <h2 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35] sm:text-5xl">Everything your homes run on.</h2>
              </div>
              <p className="max-w-sm text-[#5b6b7a]">Built with providers who support people with intellectual and developmental disabilities, around the forms and reviews they already answer to.</p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-[#e3e9df] bg-[#e3e9df] sm:grid-cols-2 lg:grid-cols-3">
              {features.map(feature => {
                const Icon = icons[feature.icon];
                return (
                  <div key={feature.title} className="bg-white p-7 transition hover:bg-[#fbfcf9]">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e2eee6] text-[#286b55]"><Icon className="h-5 w-5" /></span>
                    <h3 className="mt-5 text-lg font-bold text-[#173e35]">{feature.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[#5b6b7a]">{feature.text}</p>
                    <ul className="mt-4 space-y-1.5 text-sm text-[#173e35]">
                      {feature.points.map(point => <li key={point} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#9cc63b]" /> {point}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="day" className="scroll-mt-20 bg-[#f7f8f5] py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-center text-sm font-bold uppercase tracking-[0.18em] text-[#286b55]">A day with Mohuddle</p>
            <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35] sm:text-5xl">From clock-in to payroll, nothing falls through.</h2>
            <ol className="relative mt-14 grid gap-8 md:grid-cols-4">
              <span className="absolute left-0 right-0 top-5 hidden h-px bg-[#cfd9cb] md:block" aria-hidden="true" />
              {day.map((step, i) => (
                <li key={step.when} className="relative">
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
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#286b55]">For everyone on the team</p>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35]">Each person sees their own work.</h2>
              <p className="mt-4 leading-relaxed text-[#5b6b7a]">Staff see their shifts and notes. Home managers see their home. The office sees the whole agency. Who is told about what is a setting, not a phone call.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {roles.map(role => (
                <div key={role.who} className="rounded-3xl border border-[#e3e9df] p-6">
                  <HeartPulse className="h-5 w-5 text-[#286b55]" />
                  <h3 className="mt-4 font-bold text-[#173e35]">{role.who}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[#5b6b7a]">{role.what}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="trust" className="scroll-mt-20 bg-[#173e35] py-20 text-white sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="max-w-3xl font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">Ready for the reviewer, the auditor and the state.</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                ["Every change has a name", "Notes are signed electronically. Edits after signing keep the before and after, who made them and why."],
                ["Deadlines watch themselves", "Tier 1 incidents count down to the DIDD deadline. Late doses, overdue notes and no-shows reach the right people."],
                ["Your rules, not ours", "Clock-in allowances, required checks, note sections, review flags and who is told: all settings an admin changes."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-3xl bg-white/[0.06] p-7 ring-1 ring-white/10">
                  <ShieldCheck className="h-6 w-6 text-[#dcef98]" />
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-2 leading-relaxed text-white/70">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f7f8f5] py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35]">Questions agencies ask</h2>
            <div className="mt-10 divide-y divide-[#dfe7db] rounded-3xl bg-white px-6">
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

        <section id="demo" className="mh-hero scroll-mt-20 bg-[#0f2c25] py-20 text-white sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <h2 className="font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">See your agency on Mohuddle.</h2>
              <p className="mt-4 text-lg leading-relaxed text-white/70">A 30-minute walk-through with your own homes, forms and rules in mind. Bring a supervisor and a DSP: they will see the scribe write a note.</p>
            </div>
            <DemoForm />
          </div>
        </section>
      </main>

      <footer className="bg-[#0b221d] py-10 text-sm text-white/50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2.5"><Logo className="h-7 w-7" /> <span className="font-semibold text-white/80">{product.name}</span> · {product.tagline}</span>
          <Link href={product.signInHref} className="hover:text-white">Sign in</Link>
        </div>
      </footer>
    </>
  );
}
