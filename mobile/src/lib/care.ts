export type VisitDetail = {
  appointment: { id: string; individualId: string; type: string; scheduledAt: string; status: string; followUpNeeded: boolean; nextAppointmentId: string | null; [key: string]: string | number | boolean | null };
  person: { id: string; firstName: string; lastName: string; allergies: string; diagnoses: string };
  home: string | null; escort: string | null; escortPhone: string | null; createdBy: string | null; documentedBy: string | null;
  next: { id: string; scheduledAt: string; type: string } | null;
  history: { id: string; type: string; scheduledAt: string; status: string }[];
  canChange: boolean; canDocument: boolean;
};
export type BookingForm = { types: string[]; people: { value: string; label: string }[]; staff: { value: string; label: string }[]; contacts: Record<string, { id: string; name: string; role: string; organization: string; address: string; phone: string }[]>; today: string };
export type HealthData = {
  person: { id: string; name: string; weightLow: number | null; weightHigh: number | null; heightInches: number | null };
  weights: { id: string; recordedOn: string; pounds: number; bmi: number | null; signedName: string; comments: string }[];
  contacts: { id: string; role: string; name: string; organization: string; phone: string; email: string; [key: string]: unknown }[];
  history: { day: string; health: string; signedName: string; vitals: Record<string, number> }[];
  insurance: { id: string; payer: string; plan: string; rank: string; active: boolean }[];
  canEdit: boolean; today: string;
};
