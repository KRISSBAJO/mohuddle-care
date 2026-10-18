import type { DraftPhoto } from "./draft-photo-types";
export type IncidentUpload = { reportId: string; date: string; time: string; photos: DraftPhoto[] };
type QueueState = { jobs: IncidentUpload[]; transfers: string[] };
type Repository = { read<T>(key: string): Promise<T | null>; write(key: string, value: unknown): Promise<unknown> };

/** Only already-filed incidents enter this queue. The active writing draft remains independent. */
export function createIncidentUploadStore(storage: Repository) {
  const operations = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const next = (operations.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
    operations.set(key, next);
    void next.finally(() => { if (operations.get(key) === next) operations.delete(key); }).catch(() => {});
    return next;
  }
  const read = async (key: string): Promise<QueueState> => await storage.read<QueueState>(key) ?? { jobs: [], transfers: [] };
  return {
    list(key: string) { return serial(key, async () => (await read(key)).jobs); },
    enqueue(key: string, job: IncidentUpload) {
      // Copy before awaiting: the writer may already be starting the next incident.
      const snapshot = { ...job, photos: job.photos.map(photo => ({ ...photo })) };
      return serial(key, async () => {
        const state = await read(key);
        if (state.transfers.includes(snapshot.reportId) || state.jobs.some(item => item.reportId === snapshot.reportId)) return;
        state.transfers.push(snapshot.reportId);
        if (snapshot.photos.length) state.jobs.push(snapshot);
        await storage.write(key, state);
      });
    },
    confirmPhoto(key: string, reportId: string, photoId: string) {
      return serial(key, async () => {
        const state = await read(key), job = state.jobs.find(item => item.reportId === reportId);
        if (!job) return;
        job.photos = job.photos.filter(photo => photo.id !== photoId);
        state.jobs = state.jobs.filter(item => item.photos.length);
        await storage.write(key, state);
      });
    },
  };
}
