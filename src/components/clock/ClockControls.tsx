"use client";

import { useActionState, useEffect, useState } from "react";
import { Coffee, Loader2, Play, UtensilsCrossed } from "lucide-react";
import { formatMinutes } from "@/lib/timeclock";
import type { FormState } from "@/server/actions/auth";

/* Time on the clock so far, ticking every 30 seconds. Meal breaks already taken are passed in. */
export function LiveWorked({ since, mealMinutes, openMealSince }: { since: string; mealMinutes: number; openMealSince: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return <span>…</span>;
  const open = openMealSince ? Math.max(0, now - new Date(openMealSince).getTime()) / 60_000 : 0;
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000 - mealMinutes - open));
  return <span className="tabular-nums">{formatMinutes(minutes)}</span>;
}

/* Start and end breaks. Meal breaks are unpaid; short rest breaks are paid. */
export function BreakButtons({ onBreak, startMeal, startRest, end }: { onBreak: boolean; startMeal: () => Promise<FormState>; startRest: () => Promise<FormState>; end: () => Promise<FormState> }) {
  const [mealState, meal, mealPending] = useActionState<FormState>(startMeal, {});
  const [restState, rest, restPending] = useActionState<FormState>(startRest, {});
  const [endState, finish, endPending] = useActionState<FormState>(end, {});
  const error = mealState.error || restState.error || endState.error;
  return (
    <div>
      {onBreak ? (
        <form action={finish}>
          <button className="btn-brand w-full justify-center sm:w-auto" disabled={endPending}>
            {endPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} End break
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form action={meal}>
            <button className="btn-ghost" disabled={mealPending}>{mealPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UtensilsCrossed className="h-4 w-4" />} Meal break (unpaid)</button>
          </form>
          <form action={rest}>
            <button className="btn-ghost" disabled={restPending}>{restPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coffee className="h-4 w-4" />} Rest break (paid)</button>
          </form>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-flag">{error}</p>}
    </div>
  );
}
