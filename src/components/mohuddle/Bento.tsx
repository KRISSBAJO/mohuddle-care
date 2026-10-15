import Image from "next/image";
import { Check, CheckCheck, Target } from "lucide-react";
import { MedScroller } from "./MedScroller";

/*
 * The product, shown rather than listed: four tiles, each with one large live screen of the real
 * thing, built in HTML and CSS (no stock art). Everything in them is example data about fictional people.
 */

function Tile({ className = "", title, text, children, panel = "bg-[#eef3e6]" }: { className?: string; title: string; text: string; children: React.ReactNode; panel?: string }) {
  return (
    <div data-reveal className={`mh-reveal mh-tile group flex flex-col overflow-hidden rounded-[32px] border border-[#e3e8dc] bg-white ${className}`}>
      <div className="px-8 pb-6 pt-8">
        <h3 className="text-2xl font-bold tracking-[-0.02em] text-[#173e35]">{title}</h3>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[#5b6b62]">{text}</p>
      </div>
      <div className={`relative mx-3 mb-3 flex min-h-[340px] flex-1 items-end justify-center overflow-hidden rounded-[24px] ${panel}`}>{children}</div>
    </div>
  );
}

/* A phone rising from the bottom of the panel, showing the shift huddle. */
function HuddleScreen() {
  const people = [
    ["AR", "Aisha", "Sertraline at 8:00 AM", ""],
    ["DM", "Devon", "Allergy: penicillin", "flag"],
    ["TG", "Tasha", "Cooking goal, 1 of 3", "goal"],
  ];
  return (
    <div className="w-[290px] translate-y-6 rounded-t-[40px] border-[8px] border-b-0 border-[#173e35] bg-white px-4 pb-8 pt-4 shadow-[0_30px_60px_-30px_rgba(23,62,53,.55)] transition duration-700 group-hover:translate-y-2">
      <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-[#e3e8dc]" />
      <p className="flex items-center gap-2 rounded-2xl bg-[#e2eee6] px-3.5 py-2.5 text-xs font-bold text-[#286b55]"><Check className="h-4 w-4" /> Clocked in · Hillcrest House</p>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a9a90]">Your huddle</p>
      <ul className="mt-2 space-y-2">
        {people.map(([initials, name, line, tone], i) => (
          <li key={name} className="mh-slide-in flex items-center gap-3 rounded-2xl border border-[#eef1ea] px-3 py-2.5" style={{ ["--d" as string]: `${300 + i * 180}ms` }}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#173e35] text-[10px] font-bold text-[#dcef98]">{initials}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-[#173e35]">{name}</span>
              <span className={`block truncate text-xs ${tone === "flag" ? "font-semibold text-[#ab3c2b]" : tone === "goal" ? "text-[#377658]" : "text-[#67766c]"}`}>{line}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Notes waiting for review, with one flagged and bulk approval. */
function ReviewScreen() {
  const notes = [
    ["Brianna", "Shift note", false],
    ["Devon", "Same words as another note", true],
    ["Marcus", "Community Participation", false],
  ] as const;
  return (
    <div className="w-full max-w-[400px] px-6 pb-8">
      <div className="space-y-3">
        {notes.map(([who, line, warn], i) => (
          <div key={who} className="mh-slide-in flex items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-[0_12px_30px_-22px_rgba(23,62,53,.6)]" style={{ ["--d" as string]: `${200 + i * 180}ms` }}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 ${warn ? "border-[#e3b25d]" : "mh-check border-[#286b55] bg-[#286b55] text-white"}`} style={{ ["--d" as string]: `${800 + i * 220}ms` }}>{!warn && <Check className="h-3.5 w-3.5" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-[#173e35]">{who}</span>
              <span className={`block truncate text-xs ${warn ? "font-semibold text-[#8a5a10]" : "text-[#67766c]"}`}>{line}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#173e35] px-5 py-2.5 text-sm font-semibold text-white"><CheckCheck className="h-4 w-4 text-[#dcef98]" /> Approve 2 notes</p>
    </div>
  );
}

export function Bento() {
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <Tile className="lg:col-span-7" title="The shift huddle" text="Who you support, allergies, doses and the last handover, the moment you clock in.">
        <HuddleScreen />
      </Tile>
      <Tile className="lg:col-span-5" title="Medications" text="Every dose given, refused or late, as the day goes." panel="bg-[#173e35]">
        <MedScroller />
      </Tile>
      <Tile className="lg:col-span-5" title="Note review" text="Approve in bulk. Copied or early notes are flagged for you.">
        <ReviewScreen />
      </Tile>
      <div data-reveal className="mh-reveal mh-tile group relative min-h-[460px] overflow-hidden rounded-[32px] lg:col-span-7">
        <Image src="/images/care-kitchen.png" alt="Illustration: a support worker and a person cooking together at home" fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover transition duration-[1.4s] group-hover:scale-105" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#0f2c25]/85 to-transparent" />
        <div className="mh-float-chip absolute right-6 top-6 flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-[#173e35] shadow-lg"><Target className="h-4 w-4 text-[#377658]" /> Cooking goal · 2 of 3 this week</div>
        <div className="absolute bottom-8 left-8 right-8 text-white">
          <h3 className="text-2xl font-bold tracking-[-0.02em]">Plan goals that count</h3>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-white/80">Every note shows how often a goal was worked on, against the plan.</p>
        </div>
      </div>
    </div>
  );
}
