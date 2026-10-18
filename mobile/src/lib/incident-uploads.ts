import { drafts, draftKey } from "./drafts";
import { createIncidentUploadStore, type IncidentUpload } from "./incident-upload-store";
export type { IncidentUpload } from "./incident-upload-store";
export const incidentUploads = createIncidentUploadStore(drafts);
export const incidentUploadKey = (userId: string, agencyId: string) => draftKey(userId, agencyId, "incidentUploads", "queue");
export async function pendingIncidentUploads(userId: string, agencyId: string) {
  const key = incidentUploadKey(userId, agencyId);
  // Migrate the previous OTA's filed-report draft without deleting its encrypted photos.
  const legacy = await drafts.read<{ filedId?: string; date?: string; time?: string; photos?: IncidentUpload["photos"] }>(draftKey(userId, agencyId, "report", "new"));
  if (legacy?.filedId) await incidentUploads.enqueue(key, { reportId: legacy.filedId, date: legacy.date ?? "", time: legacy.time ?? "", photos: legacy.photos ?? [] });
  return incidentUploads.list(key);
}
