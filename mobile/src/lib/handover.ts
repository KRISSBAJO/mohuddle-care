/*
 * Several handovers at one home, read as one: when eight people hand over to two, each person
 * taking over reads one combined handover and acknowledges it once. Each item shows who did it and
 * who did not, with their reason. A copy of src/lib/handover.ts on the website; keep the two the same.
 */

export type HandoverInput = {
  note: string;
  people: { individualId: string; name: string; note: string }[];
  checks: { label: string; done: boolean; comment: string }[];
  incident: "none" | "reported" | "not_reported";
  staff: string | null;
  createdAt: Date | string;
};

export type CombinedHandover = {
  from: string[];
  notes: { staff: string; note: string; at: Date | string }[];
  people: { name: string; notes: { staff: string; note: string }[] }[];
  checks: { label: string; done: string[]; notDone: { staff: string; comment: string }[] }[];
  incidents: { staff: string; reported: boolean }[];
};

export function combineHandovers(list: HandoverInput[]): CombinedHandover {
  const name = (handover: HandoverInput) => handover.staff ?? "A staff member";
  const ordered = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const people = new Map<string, { name: string; notes: { staff: string; note: string }[] }>();
  const checks = new Map<string, { label: string; done: string[]; notDone: { staff: string; comment: string }[] }>();
  for (const handover of ordered) {
    for (const person of handover.people) {
      const entry = people.get(person.individualId) ?? { name: person.name, notes: [] };
      entry.notes.push({ staff: name(handover), note: person.note });
      people.set(person.individualId, entry);
    }
    for (const check of handover.checks) {
      const entry = checks.get(check.label) ?? { label: check.label, done: [], notDone: [] };
      if (check.done) entry.done.push(name(handover));
      else entry.notDone.push({ staff: name(handover), comment: check.comment });
      checks.set(check.label, entry);
    }
  }
  return {
    from: [...new Set(ordered.map(name))],
    notes: ordered.filter(handover => handover.note).map(handover => ({ staff: name(handover), note: handover.note, at: handover.createdAt })),
    people: [...people.values()],
    // Items someone did not do come first.
    checks: [...checks.values()].sort((a, b) => Number(b.notDone.length > 0) - Number(a.notDone.length > 0)),
    incidents: ordered.filter(handover => handover.incident !== "none").map(handover => ({ staff: name(handover), reported: handover.incident === "reported" })),
  };
}
