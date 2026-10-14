"use client";

import { useState } from "react";
import { billableMinutes, durationWords } from "@/lib/community-note";

/* Start and end times, with the billable time worked out as they are typed. */
export function CommunityTimes({ today }: { today: string }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const minutes = billableMinutes(start, end);
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <div>
        <label htmlFor="cp-date" className="label">Date</label>
        <input id="cp-date" name="noteDate" type="date" required max={today} defaultValue={today} className="field" />
      </div>
      <div>
        <label htmlFor="cp-start" className="label">Start time</label>
        <input id="cp-start" name="startTime" type="time" required value={start} onChange={event => setStart(event.target.value)} className="field" />
      </div>
      <div>
        <label htmlFor="cp-end" className="label">End time</label>
        <input id="cp-end" name="endTime" type="time" required value={end} onChange={event => setEnd(event.target.value)} className="field" />
      </div>
      <div>
        <p className="label">Billable time</p>
        <p className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold tabular-nums ${start && end && minutes === null ? "bg-flag-soft text-flag" : "bg-panel"}`} aria-live="polite">
          {minutes !== null ? durationWords(minutes) : start && end ? "End is before start" : "—"}
        </p>
      </div>
    </div>
  );
}
