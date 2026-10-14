type Actor = { role: string; staffId: string | null };
type Shift = { staffId: string | null; status: string };
export type ShiftUpdate = "confirmed" | "completed" | "missed";

export function assertShiftUpdate(actor: Actor, shift: Shift | undefined, status: string): asserts status is ShiftUpdate {
  if (!["confirmed", "completed", "missed"].includes(status)) throw new Error("Invalid shift update.");
  const manager = actor.role === "admin" || actor.role === "coordinator";
  if (!shift || (!manager && (!actor.staffId || shift.staffId !== actor.staffId))) {
    throw new Error("You can only update your own shifts.");
  }
  if (!shift.staffId) throw new Error("Assign this shift before updating its status.");
  const allowed = status === "confirmed" ? ["scheduled"] : ["scheduled", "confirmed"];
  if (!allowed.includes(shift.status)) throw new Error("This shift cannot move to that status.");
}
