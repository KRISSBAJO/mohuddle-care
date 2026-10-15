"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, ChevronDown, Pill, Target, Users, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import { clockTime, huddleHighlights, huddleScript, incidentWord, type Huddle } from "@/lib/huddle";

/*
 * The shift huddle on the clock: a 30-second briefing for the shift, shown open right after
 * clocking in. "Read it to me" uses the device's own voice; nothing leaves the device for that.
 */
export function HuddleCard({ huddle, startOpen }: { huddle: Huddle; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [speaking, setSpeaking] = useState(false);
  const highlights = huddleHighlights(huddle);

  function readAloud() {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const words = new SpeechSynthesisUtterance(huddleScript(huddle));
    words.onend = () => setSpeaking(false);
    words.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(words);
    setSpeaking(true);
  }

  return (
    <section className="card mb-6 overflow-hidden" aria-label="Shift huddle">
      <div className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-[#eef3e6] to-white px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#173e35] text-[#dcef98]"><Users className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Your huddle{huddle.state === "upcoming" ? " for the next shift" : ""}</h2>
          <p className="text-sm text-mute">
            {huddle.home} · {huddle.people.length} {huddle.people.length === 1 ? "person" : "people"}
            {highlights.length ? ` · ${highlights.length} ${highlights.length === 1 ? "thing" : "things"} to know` : ""}
          </p>
        </div>
        <button type="button" onClick={readAloud} className="btn-ghost btn-sm" aria-pressed={speaking}>
          {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} {speaking ? "Stop" : "Read it to me"}
        </button>
        <button type="button" onClick={() => setOpen(value => !value)} className="btn-ghost btn-sm" aria-expanded={open}>
          {open ? "Hide" : "Show"} <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
        </button>
      </div>

      {highlights.length > 0 && (
        <ul className="space-y-1 border-t border-line bg-accent-soft/60 px-5 py-3 text-sm">
          {highlights.map(line => <li key={line} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#8a5a10]" /> {line}</li>)}
        </ul>
      )}

      {open && (
        <div className="border-t border-line">
          {huddle.handover && (
            <div className="border-b border-line px-5 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">Last handover · {huddle.handover.from} · {clockTime(huddle.handover.at)}</p>
              <p className="mt-1 whitespace-pre-line">{huddle.handover.note || "No note written."}</p>
            </div>
          )}
          <ul className="grid gap-px bg-line/60 sm:grid-cols-2">
            {huddle.people.map(person => (
              <li key={person.id} className="bg-white px-5 py-4 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/app/individuals/${person.id}`} className="font-semibold hover:text-brand">{person.fullName}</Link>
                  {person.allergies.trim() && <span className="rounded-full bg-flag-soft px-2 py-0.5 text-[11px] font-semibold text-flag">Allergy: {person.allergies.trim()}</span>}
                </div>
                {(person.diet || person.mobility) && <p className="mt-0.5 text-xs text-mute">{[person.diet && `Diet: ${person.diet}`, person.mobility && `Mobility: ${person.mobility}`].filter(Boolean).join(" · ")}</p>}
                {person.handoverNote && <p className="mt-1.5 text-xs"><span className="font-semibold">Handover: </span>{person.handoverNote}</p>}
                <ul className="mt-2 space-y-1 text-xs">
                  {person.doses.map(dose => (
                    <li key={dose.at + dose.name} className={cn("flex items-center gap-1.5", dose.late && "font-semibold text-flag")}><Pill className="h-3.5 w-3.5" /> {clockTime(dose.at)} {dose.name} {dose.dose}{dose.late ? " · late" : ""}</li>
                  ))}
                  {person.appointments.map(visit => (
                    <li key={visit.at} className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-brand" /> {clockTime(visit.at)} {visit.what}{visit.escort ? ` · ${visit.escort}` : " · no escort yet"}</li>
                  ))}
                  {person.incidents.map(item => (
                    <li key={item.at} className="flex items-center gap-1.5 text-[#8a5a10]"><AlertTriangle className="h-3.5 w-3.5" /> {incidentWord(item.category)} incident, {new Date(item.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</li>
                  ))}
                  {person.goals.map(goal => (
                    <li key={goal.title} className="flex items-center gap-1.5 text-mute"><Target className="h-3.5 w-3.5 text-sage" /> {goal.title}: {goal.label.toLowerCase()}</li>
                  ))}
                  {!person.doses.length && !person.appointments.length && !person.incidents.length && !person.goals.length && <li className="text-dim">Nothing due this shift.</li>}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
