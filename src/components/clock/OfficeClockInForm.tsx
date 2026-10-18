"use client";
import { startTransition, useActionState, useState } from "react";
import { usePosition } from "./usePosition";
import { locationVerdict } from "@/lib/timeclock";
import type { FormState } from "@/server/actions/auth";
export function OfficeClockInForm({ action, office, statements }: { action: (previous: FormState, form: FormData) => Promise<FormState>; office: { address: string; point: { latitude: number; longitude: number }; radius: number }; statements: string[] }) {
  const [state, formAction, busy] = useActionState(action, {});
  const [reason, setReason] = useState(""), [checked, setChecked] = useState<string[]>([]);
  const location = usePosition(true), position = location.position;
  const located = Boolean(position && position.accuracy != null && position.accuracy <= Math.min(office.radius, 100) && locationVerdict(office.point, { ...position, accuracy: 0 }, office.radius).state === "ok");
  return <form className="card space-y-5 p-5" onSubmit={event => { event.preventDefault(); const form = new FormData(); form.set("payload", JSON.stringify({ workType: "office", reason, position, statements: checked })); startTransition(() => formAction(form)); }}>
    <p className="font-semibold">{office.address}</p><p className="text-sm text-mute">This is office work, separate from care visits. Another manager must review the completed punch before payroll approval. A due care shift takes priority.</p>
    <div><p className={located ? "font-semibold text-sage" : "text-sm text-mute"}>{located ? "Office location verified." : "An accurate phone location inside the office area is required. If your phone cannot locate you, ask your manager to record the missed office time."}</p><button type="button" className="btn-ghost mt-2" onClick={location.retry}>Check location again</button></div>
    <label className="block"><span className="label">What office work will you do?</span><textarea className="field" rows={4} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required minLength={10} /></label>
    {statements.map(statement => <label key={statement} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={checked.includes(statement)} onChange={event => setChecked(event.target.checked ? [...checked, statement] : checked.filter(item => item !== statement))} />{statement}</label>)}
    {state.error ? <p role="alert" className="rounded-xl bg-flag-soft p-3 text-flag">{state.error}</p> : null}
    <button type="submit" className="btn-brand w-full justify-center" disabled={busy || !located || reason.trim().length < 10 || statements.some(statement => !checked.includes(statement))}>{busy ? "Starting…" : "Clock in for office work"}</button>
    <p className="text-xs text-mute">Location is checked at clock-in and clock-out. No background tracking.</p>
  </form>;
}
