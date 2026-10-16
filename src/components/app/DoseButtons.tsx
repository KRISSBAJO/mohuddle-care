import { recordDoseAction } from "@/server/actions/hub";
import { cn } from "@/lib/cn";

/*
 * Given, Refused, Held and Missed for one dose. One form and one action per dose: the button pressed
 * says which. A page with hundreds of doses stays small, because nothing is bound per button.
 */
export function DoseButtons({ adminId, notYet, noteLabel, className, noteClassName = "w-32" }: { adminId: string; notYet: boolean; noteLabel: string; className?: string; noteClassName?: string }) {
  return (
    <form action={recordDoseAction} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <input type="hidden" name="adminId" value={adminId} />
      <input name="note" placeholder="Note" className={cn("field py-1.5 text-xs", noteClassName)} aria-label={noteLabel} />
      <button name="status" value="given" className="btn-brand btn-sm disabled:opacity-50" disabled={notYet} title={notYet ? "Not due yet" : undefined}>Given</button>
      <button name="status" value="refused" className="btn-ghost btn-sm">Refused</button>
      <button name="status" value="held" className="btn-ghost btn-sm">Held</button>
      <button name="status" value="missed" className="btn-ghost btn-sm text-flag">Missed</button>
    </form>
  );
}
