/*
 * Where an appointment stands. Pure, so it is unit tested and used the same way on every screen
 * and by the reminder sweep.
 */

export type AppointmentLike = {
  status: "scheduled" | "completed" | "cancelled" | "missed";
  scheduledAt: Date;
  documentedAt: Date | null;
  followUpNeeded: boolean;
  followUpBy: string | null;
  nextAppointmentId: string | null;
};

export type VisitState = "upcoming" | "today" | "to_document" | "documentation_overdue" | "completed" | "cancelled" | "missed";

export const VISIT_STATE = {
  upcoming: { text: "Upcoming", tone: "brand" },
  today: { text: "Today", tone: "plum" },
  to_document: { text: "Needs documenting", tone: "warn" },
  documentation_overdue: { text: "Documentation overdue", tone: "bad" },
  completed: { text: "Documented", tone: "good" },
  cancelled: { text: "Cancelled", tone: "neutral" },
  missed: { text: "Missed", tone: "bad" },
} as const;

/* Upcoming until it starts, then it needs documenting; late once the documentation window passes. */
export function visitState(appointment: AppointmentLike, now: number, documentHours: number, today: string, dayOf: (at: Date) => string): VisitState {
  if (appointment.status !== "scheduled") return appointment.status;
  const at = appointment.scheduledAt.getTime();
  if (at > now) return dayOf(appointment.scheduledAt) === today ? "today" : "upcoming";
  return now - at > documentHours * 3_600_000 ? "documentation_overdue" : "to_document";
}

export type FollowUpState = "none" | "booked" | "to_book" | "overdue";

/* A follow-up the doctor asked for is open until the next appointment is booked. */
export function followUpState(appointment: AppointmentLike, today: string): FollowUpState {
  if (appointment.status !== "completed" || !appointment.followUpNeeded) return "none";
  if (appointment.nextAppointmentId) return "booked";
  return appointment.followUpBy && appointment.followUpBy < today ? "overdue" : "to_book";
}
