"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";

/*
 * Large outlined words gliding past, with a pause button (people who find moving text hard can
 * stop it). Words fill in on hover. Listed twice so the loop has no seam.
 */
export function OutlineMarquee({ items }: { items: string[] }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="relative border-y border-[#e3e8dc] bg-white">
      <div className={`mh-outline-marquee overflow-hidden py-7 sm:py-9 ${paused ? "is-paused" : ""}`}>
        <div className="mh-marquee-track">
          {[0, 1].map(copy => (
            <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
              {items.map(item => (
                <span key={`${copy}-${item}`} className="flex items-center">
                  <span className="mh-outline-word whitespace-nowrap">{item}</span>
                  <span className="mx-8 h-3 w-3 shrink-0 rounded-full bg-[#c5dd7f] sm:mx-12" aria-hidden="true" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused(value => !value)}
        className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#e3e8dc] bg-white text-[#173e35] shadow-sm transition hover:border-[#9cc63b] sm:right-8"
        aria-label={paused ? "Play the moving words" : "Pause the moving words"}
        aria-pressed={paused}
      >
        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </button>
    </div>
  );
}
