/*
 * What the owner console's health page needs to know about work done in the background: the last
 * reminder sweeps and recent errors. Kept in memory on this server (it resets on restart), on
 * globalThis so every copy of the module, and instrumentation.ts, share it. No imports, so the
 * instrumentation hook can use it too.
 */

export type Problem = { at: number; where: string; message: string };
export type SweepRun = { startedAt: number; finishedAt: number; sent: number; agencies: number; failures: Problem[] };

type Log = { sweeps: SweepRun[]; problems: Problem[] };
const holder = globalThis as unknown as { mohuddleHealth?: Log };
const log = (holder.mohuddleHealth ??= { sweeps: [], problems: [] });

const keep = <T>(list: T[], item: T, max: number) => {
  list.unshift(item);
  if (list.length > max) list.length = max;
};

/* Something went wrong somewhere: a request, a job, one agency's reminders. */
export function noteProblem(where: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  keep(log.problems, { at: Date.now(), where, message: message.slice(0, 400) }, 40);
}

export function noteSweep(run: SweepRun) {
  keep(log.sweeps, run, 20);
}

export const healthLog = () => log;
