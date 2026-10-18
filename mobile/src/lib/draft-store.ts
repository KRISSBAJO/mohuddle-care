/** A two-slot journal: a failed write cannot replace the last complete draft. */
export type DraftStorage = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<unknown>;
  remove: (key: string) => Promise<unknown>;
};
type Head = { slot: number; count: number };
export function createDraftStore(storage: DraftStorage) {
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    queues.set(key, next);
    void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
    return next;
  }
  async function head(key: string): Promise<Head | null> {
    const raw = await storage.read(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Head;
    if (![0, 1].includes(value.slot) || !Number.isInteger(value.count) || value.count < 1 || value.count > 2000) throw new Error("Unreadable draft");
    return value;
  }
  return {
    read<T>(key: string): Promise<T | null> {
      return serial(key, async () => {
        const current = await head(key);
        if (!current) return null;
        let raw = "";
        for (let i = 0; i < current.count; i++) {
          const part = await storage.read(`${key}.${current.slot}.${i}`);
          if (part === null) throw new Error("Incomplete draft");
          raw += JSON.parse(part) as string;
        }
        return JSON.parse(raw) as T;
      });
    },
    write(key: string, value: unknown) {
      // Snapshot before enqueueing. 300 UTF-16 code units stay below SecureStore's small-value limit,
      // even when JSON escapes a surrogate at a chunk boundary.
      const raw = JSON.stringify(value);
      if (raw.length > 600_000) return Promise.reject(new Error("Draft is too large"));
      return serial(key, async () => {
        const current = await head(key);
        const slot = current?.slot === 0 ? 1 : 0;
        const count = Math.ceil(raw.length / 300);
        const oldCount = Number(await storage.read(`${key}.${slot}.count`) ?? 0);
        // Reserve all keys before writing, so cleanup also knows about an interrupted first write.
        await storage.write(`${key}.${slot}.count`, String(Math.max(count, oldCount)));
        for (let i = 0; i < count; i++) await storage.write(`${key}.${slot}.${i}`, JSON.stringify(raw.slice(i * 300, (i + 1) * 300)));
        await storage.write(key, JSON.stringify({ slot, count }));
        for (let i = count; i < oldCount; i++) await storage.remove(`${key}.${slot}.${i}`);
        await storage.write(`${key}.${slot}.count`, String(count));
      });
    },
    clear(key: string) {
      return serial(key, async () => {
        // Remove the pointer first. Interrupted cleanup cannot resurrect a submitted draft.
        await storage.remove(key);
        for (const slot of [0, 1]) {
          const count = Math.min(2000, Number(await storage.read(`${key}.${slot}.count`) ?? 0));
          for (let i = 0; i < count; i++) await storage.remove(`${key}.${slot}.${i}`);
          await storage.remove(`${key}.${slot}.count`);
        }
      });
    },
  };
}
