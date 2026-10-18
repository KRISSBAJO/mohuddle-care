export type NoteKind = "daily" | "community";
export type NoteRow = { id: string; kind: NoteKind; person: string; day: string; status?: string; reason?: string; flags?: string[]; writer?: string | null };
export type NoteInbox = {
  returned: NoteRow[]; review: NoteRow[]; recent: NoteRow[];
  people: { id: string; name: string }[]; staff: { id: string; name: string }[];
  community: { today: string; costCenters: string[]; minimum: number };
};
export type NoteRecord = {
  note: NoteRow & { returnReason: string; signedName: string; signedAt: string | null };
  rights: { writer: boolean; reviewer: boolean; edit: boolean; approve: boolean; returnIt: boolean; reopen: boolean };
  fields: Record<string, string>; labels: Record<string, string>; version: string;
  locations: string[]; moods: string[]; costCenters: string[]; minimum: number;
  details: [string, unknown][]; goals: Record<string, unknown>[];
  events: { id: string; action: string; note: string; at: string; by: string | null; changes: { field: string; before: string; after: string }[] }[];
};
export const words = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.]/g, " ").replace(/^./, letter => letter.toUpperCase());
export const communityLabels: Record<string, string> = { noteDate: "Date (YYYY-MM-DD)", startTime: "Start (HH:MM)", endTime: "Finish (HH:MM)", trips: "Number of trips", otherParty: "Other responsible party", selection: "How the activity was selected", location: "Where", activity: "Activity", note: "How it went", learning: "Learning opportunities" };
