/*
 * Runs once when the server starts. It starts a one-minute tick for timed reminders (shift starting,
 * break ending, still clocked in, and the rest), so they go out on time even when nobody has the app
 * open. It calls the app's own protected endpoint rather than importing server code here.
 */
/* Every error a request throws is noted for the owner console's health page. */
export async function onRequestError(error: unknown, request: { path: string; method: string }) {
  const { noteProblem } = await import("./server/health-log");
  noteProblem(`${request.method} ${request.path.split("?")[0]}`, error);
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.CRON_SECRET) return;
  const state = globalThis as unknown as { mohuddleTick?: ReturnType<typeof setInterval> };
  if (state.mohuddleTick) return;
  const base = (process.env.APP_URL ?? "http://127.0.0.1:3400").replace("//localhost", "//127.0.0.1").replace(/\/$/, "");
  const tick = () =>
    fetch(`${base}/api/cron/sweep`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(50_000) }).catch(() => undefined);
  state.mohuddleTick = setInterval(tick, 60_000);
  setTimeout(tick, 15_000);
}
