"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Mic, PenLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = [
  { title: "Speak", lead: "Tell it like you would tell the next shift.", text: "Tap Start speaking and talk for a minute or two. A checklist on screen reminds you what to cover: meals, medications, goals, behaviour, sleep and family." },
  { title: "Check", lead: "Your words become the note.", text: "Meals go in meals, behaviour in behaviour, and a summary at the end. Every filled part is highlighted, and it tells you what you did not mention." },
  { title: "Sign", lead: "You stay the author.", text: "Change anything that is wrong and sign it yourself. The AI never signs, never overwrites what you typed, and supervisors still review it." },
];

const WORDS = "She ate all of her oatmeal and two cups of water, took her Sertraline fine. We worked on her cooking goal, she made a salad for lunch with one reminder…".split(" ");

/* Screen 1: listening, with the words appearing as they are said. */
function Listening({ active }: { active: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 rounded-2xl bg-[#f3f6ef] p-3">
        <span className={cn("grid h-11 w-11 place-items-center rounded-full bg-[#ab3c2b] text-white", active && "mh-mic-pulse")}><Mic className="h-5 w-5" /></span>
        <div className="flex h-10 min-w-0 flex-1 items-center gap-[3px] overflow-hidden">
          {Array.from({ length: 30 }, (_, i) => <span key={i} className={cn("w-[3px] shrink-0 rounded-full bg-[#286b55]", active ? "mh-demo-bar" : "h-[20%]")} style={{ animationDelay: `${(i % 7) * 0.12}s` }} />)}
        </div>
        <span className="text-xs font-bold tabular-nums text-[#ab3c2b]">REC</span>
      </div>
      <p className="mt-5 text-[15px] leading-relaxed text-[#173e35]">
        {WORDS.map((word, i) => (
          <span key={i} className={cn("transition-all duration-300", active ? "mh-word-live" : "opacity-100")} style={{ animationDelay: `${0.35 + i * 0.12}s` }}>{word} </span>
        ))}
      </p>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-5 text-[11px] font-semibold text-[#5b6b62]">
        {["Meals and drinks", "Medications", "Plan goals", "Behaviour"].map((item, i) => (
          <span key={item} className={cn("flex items-center gap-1.5 rounded-lg bg-[#f3f6ef] px-2.5 py-2", active && "mh-tick")} style={{ animationDelay: `${1.6 + i * 0.6}s` }}>
            <span className="grid h-4 w-4 place-items-center rounded-full bg-[#dcef98]"><Check className="h-3 w-3 text-[#173e35]" /></span>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/* Screen 2: the note's parts filling in, highlighted. */
function Filling({ active }: { active: boolean }) {
  const parts = [
    ["Meals", "Ate all of her oatmeal; two cups of water (16 oz)."],
    ["Health", "Took her morning Sertraline with no problem."],
    ["Plan goal", "Made a salad for lunch with one reminder to wash the lettuce."],
    ["Summary", "A calm, good shift. Worked on cooking; walked to the park."],
  ];
  return (
    <div className="flex h-full flex-col gap-2.5">
      <p className="flex items-center gap-2 text-xs font-bold text-[#286b55]"><Sparkles className="h-4 w-4" /> Filled 4 parts of the note</p>
      {parts.map(([title, text], i) => (
        <div key={title} className={cn("rounded-xl border-l-[3px] border-[#e7b008] bg-[#fffbeb] px-3 py-2.5", active && "mh-fill-in")} style={{ animationDelay: `${0.25 + i * 0.45}s` }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a5a10]">{title}</p>
          <p className="text-[13px] leading-snug text-[#173e35]">{text}</p>
        </div>
      ))}
      <p className={cn("mt-auto rounded-xl bg-[#f3f6ef] px-3 py-2.5 text-[12px] text-[#5b6b62]", active && "mh-fill-in")} style={{ animationDelay: "2.2s" }}>Not mentioned: <span className="font-semibold text-[#173e35]">sleep</span>. Add it, or record more.</p>
    </div>
  );
}

/* Screen 3: a signature drawn, then stamped. */
function Signing({ active }: { active: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className="rounded-2xl border border-[#e3e8dc] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a9a90]">Signed by</p>
        <svg viewBox="0 0 260 80" className="mt-1 h-20 w-full" aria-hidden="true">
          <path className={cn("mh-signature", active && "is-drawing")} d="M10 55 C 30 10, 45 70, 60 40 S 85 20, 95 50 S 120 65, 130 35 C 140 15, 150 60, 165 45 S 190 30, 205 48 C 215 58, 230 40, 250 30" />
        </svg>
        <div className="mt-1 border-t border-dashed border-[#cfd9cb] pt-2 text-xs text-[#5b6b62]">Jordan Price · 3:12 PM</div>
      </div>
      <div className={cn("mx-auto mt-6 grid h-28 w-28 place-items-center rounded-full border-4 border-[#286b55] text-center text-[#286b55]", active ? "mh-stamp-hit" : "opacity-0")}>
        <span className="text-[11px] font-black uppercase leading-tight tracking-[0.12em]">Signed<br />and saved</span>
      </div>
      <p className="mt-auto flex items-center gap-2 rounded-xl bg-[#e2eee6] px-3 py-2.5 text-[12px] font-semibold text-[#286b55]"><PenLine className="h-4 w-4" /> Sent to your supervisor for review</p>
    </div>
  );
}

/*
 * The scribe, told as a scroll story: the phone stays in view while the three steps scroll past,
 * and its screen changes with each. Readable as a plain list without JavaScript.
 */
export function ScribeStory() {
  const [step, setStep] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const watch = new IntersectionObserver(
      entries => {
        for (const entry of entries) if (entry.isIntersecting) setStep(Number((entry.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach(element => element && watch.observe(element));
    return () => watch.disconnect();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)] lg:self-start">
        <div className="relative mx-auto flex h-full max-h-[640px] items-center justify-center">
          <div className="mh-phone relative w-full max-w-[340px]">
            <div className="mh-phone-notch" aria-hidden="true" />
            <div className="flex items-center justify-between px-5 pt-9 text-[11px] font-semibold text-[#5b6b62]">
              <span>Aisha · Day shift</span>
              <span className="flex gap-1">{[0, 1, 2].map(i => <span key={i} className={cn("h-1.5 rounded-full transition-all duration-500", i === step ? "w-6 bg-[#286b55]" : "w-1.5 bg-[#cfd9cb]")} />)}</span>
            </div>
            <div className="relative mx-4 mb-5 mt-3 h-[430px] overflow-hidden">
              {[Listening, Filling, Signing].map((Screen, i) => (
                <div key={i} className={cn("absolute inset-0 transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)]", i === step ? "translate-y-0 opacity-100" : i < step ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0")} aria-hidden={i !== step}>
                  <Screen active={i === step} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div>
        {STEPS.map((item, i) => (
          <div key={item.title} ref={element => { refs.current[i] = element; }} data-step={i} className="flex min-h-[70vh] items-center py-10 lg:min-h-[85vh]">
            <div className={cn("transition-all duration-700", i === step ? "opacity-100" : "opacity-35 lg:translate-x-2")}>
              <span className="font-display text-[88px] font-bold leading-none tracking-[-0.06em] text-[#dcef98] [-webkit-text-stroke:1.5px_#9cc63b] sm:text-[120px]">0{i + 1}</span>
              <h3 className="mt-2 font-display text-4xl font-bold tracking-[-0.03em] text-[#173e35] sm:text-5xl">{item.title}</h3>
              <p className="mt-3 text-xl font-semibold text-[#377658]">{item.lead}</p>
              <p className="mt-3 max-w-md text-lg leading-relaxed text-[#5b6b62]">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
