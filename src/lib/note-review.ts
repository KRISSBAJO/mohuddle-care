/*
 * Reviewing notes after they are signed. A note starts "submitted"; a reviewer approves it or
 * returns it to the writer with a reason, and the writer edits and resubmits. Checks flag notes
 * that deserve a closer look. No database access here, so the rules can be tested on their own.
 */

export type ReviewStatus = "submitted" | "returned" | "approved";
export type NoteKind = "daily" | "community";

export const REVIEW_WORDS: Record<ReviewStatus, string> = { submitted: "To review", returned: "Returned", approved: "Approved" };
export const REVIEW_TONE = { submitted: "warn", returned: "bad", approved: "good" } as const;
export const KIND_WORDS: Record<NoteKind, string> = { daily: "Shift note", community: "Community Participation" };

export type FlagKey = "late" | "no_punch" | "outside_punch" | "attention" | "resubmitted";
export const FLAG_WORDS: Record<FlagKey, string> = {
  late: "Written late",
  no_punch: "No clock punch",
  outside_punch: "Outside the punch",
  attention: "Behaviour, seizure or low mood",
  resubmitted: "Resubmitted",
};

/* What the checks need to know about one note. Times are milliseconds; null when the note has none. */
export type NoteFacts = {
  noteDay: string;
  writtenDay: string;
  start: number | null;
  end: number | null;
  /* The writer's clock punches around the note, or null when the writer has no staff record to punch with. */
  punches: { in: number; out: number | null }[] | null;
  attention: boolean;
  resubmitted: boolean;
};

/* The checks a note fails, from those switched on. A punch still open counts up to now. */
export function reviewFlags(facts: NoteFacts, enabled: FlagKey[], toleranceMinutes: number, now: number): FlagKey[] {
  const flags: FlagKey[] = [];
  const on = (key: FlagKey) => enabled.includes(key);
  if (on("late") && facts.writtenDay > facts.noteDay) flags.push("late");
  if (facts.punches && facts.start !== null && facts.end !== null) {
    const start = facts.start;
    const end = facts.end;
    const touching = facts.punches.filter(punch => punch.in < end && (punch.out ?? now) > start);
    if (!touching.length) {
      if (on("no_punch")) flags.push("no_punch");
    } else if (on("outside_punch")) {
      const slack = toleranceMinutes * 60_000;
      const first = Math.min(...touching.map(punch => punch.in));
      const last = Math.max(...touching.map(punch => punch.out ?? now));
      if (start < first - slack || end > last + slack) flags.push("outside_punch");
    }
  }
  if (on("attention") && facts.attention) flags.push("attention");
  if (on("resubmitted") && facts.resubmitted) flags.push("resubmitted");
  return flags;
}

export type Reviewer = { role: string; staffId: string | null; name: string };
export type ReviewTarget = { writerStaffId: string | null; signedName: string; homeManagerStaffId: string | null };

/* Reviewers are the chosen login roles and the person's home manager. Nobody reviews their own note. */
export function mayReview(user: Reviewer, note: ReviewTarget, roles: string[]): boolean {
  const own = user.staffId ? user.staffId === note.writerStaffId : !note.writerStaffId && user.name === note.signedName;
  if (own) return false;
  return roles.includes(user.role) || (user.staffId !== null && user.staffId === note.homeManagerStaffId);
}

/* What may happen to a note now, for this user. */
export function noteRights(user: Reviewer, note: ReviewTarget & { status: ReviewStatus }, roles: string[]) {
  const reviewer = mayReview(user, note, roles);
  const writer = user.staffId ? user.staffId === note.writerStaffId : !note.writerStaffId && user.name === note.signedName;
  return {
    reviewer,
    writer,
    approve: reviewer && note.status === "submitted",
    returnIt: reviewer && note.status === "submitted",
    edit: (reviewer && note.status !== "approved") || (writer && note.status === "returned"),
    reopen: user.role === "admin" && !writer && note.status === "approved",
  };
}

/* Field by field, what an edit changed, using plain labels. Unchanged fields are left out. */
export function changesBetween(before: Record<string, string>, after: Record<string, string>, labels: Record<string, string>) {
  return Object.keys(after)
    .filter(field => (before[field] ?? "") !== (after[field] ?? ""))
    .map(field => ({ field: labels[field] ?? field, before: before[field] ?? "", after: after[field] ?? "" }));
}

/* "daily:uuid" pairs from a bulk form, keeping only well-formed ones and dropping repeats. */
export function readNoteRefs(values: string[]): { kind: NoteKind; id: string }[] {
  const seen = new Set<string>();
  return values.flatMap(value => {
    const match = /^(daily|community):([0-9a-f-]{36})$/.exec(value);
    if (!match || seen.has(value)) return [];
    seen.add(value);
    return [{ kind: match[1] as NoteKind, id: match[2] }];
  });
}
