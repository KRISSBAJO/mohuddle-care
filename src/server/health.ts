import "server-only";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { pool, schema, systemDb, systemPool } from "./db";
import { env } from "./env";
import { healthLog } from "./health-log";
import { pushEnabled } from "./push";
import { modelLoaded, scribeStatus, speechRunning } from "./scribe";
import { settingDefs } from "./settings";

export type Level = "good" | "warn" | "bad";

/* "j…e@milestonecare.net": enough to recognise an address on a shared screen, not to copy it. */
const masked = (address: string) => {
  const [name, domain] = address.split("@");
  return name.length <= 2 ? `${name[0] ?? ""}…@${domain}` : `${name[0]}…${name.slice(-1)}@${domain}`;
};

/* Everything the owner console's health page shows, checked now. */
export async function healthReport() {
  const now = Date.now();
  const log = healthLog();
  const lastSweep = log.sweeps[0] ?? null;
  const day = new Date(now - 86_400_000);

  // Database: reachable, its size, and how busy the app's connections are.
  let database: { level: Level; detail: string; sizeMb?: number; migrations?: number } = { level: "bad", detail: "Not reachable." };
  try {
    const { rows } = await systemPool.query<{ size: string; migrations: number }>("select pg_database_size(current_database())::text as size, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    database = { level: "good", detail: "Reachable.", sizeMb: Math.round(Number(rows[0].size) / 1_048_576), migrations: rows[0].migrations };
  } catch (error) {
    database = { level: "bad", detail: (error as Error).message };
  }

  // Email across every agency in the last day, and the latest failures.
  const emailCounts = await systemDb.select({ status: schema.emailMessages.status, n: count() }).from(schema.emailMessages).where(gt(schema.emailMessages.createdAt, day)).groupBy(schema.emailMessages.status);
  const emailFailures = await systemDb
    .select({ at: schema.emailMessages.createdAt, kind: schema.emailMessages.kind, to: schema.emailMessages.toAddress, detail: schema.emailMessages.detail, agency: schema.agencies.name })
    .from(schema.emailMessages)
    .innerJoin(schema.agencies, eq(schema.agencies.id, schema.emailMessages.agencyId))
    .where(and(eq(schema.emailMessages.status, "failed"), gt(schema.emailMessages.createdAt, new Date(now - 7 * 86_400_000))))
    .orderBy(desc(schema.emailMessages.createdAt))
    .limit(10);
  const counted = (status: string) => emailCounts.find(row => row.status === status)?.n ?? 0;
  const sending = env.EMAIL_PROVIDER === "relykit" && Boolean(env.RELYKIT_API_KEY);

  const [devices] = await systemDb.select({ n: count() }).from(schema.pushSubscriptions);

  // The note scribe, with the models the settings use unless an agency changed them.
  const speechModel = settingDefs.scribe_speech.fallback;
  const noteModel = settingDefs.scribe_model.fallback;
  const scribe = await scribeStatus(speechModel, noteModel);
  const loaded = scribe.drafting ? await modelLoaded(noteModel) : false;

  const sweepAge = lastSweep ? now - lastSweep.finishedAt : null;
  const memory = process.memoryUsage();
  return {
    checkedAt: new Date(now),
    sweep: {
      level: (sweepAge === null ? "warn" : sweepAge > 5 * 60_000 ? "bad" : lastSweep!.failures.length ? "warn" : "good") as Level,
      last: lastSweep,
      recent: log.sweeps.slice(0, 10),
      tickOn: Boolean(process.env.CRON_SECRET),
    },
    email: {
      level: (!sending ? "warn" : emailFailures.some(item => now - item.at.getTime() < 86_400_000) ? "warn" : "good") as Level,
      provider: env.EMAIL_PROVIDER,
      sending,
      from: env.EMAIL_FROM,
      lastDay: { sent: counted("sent"), queued: counted("queued"), failed: counted("failed") },
      failures: emailFailures.map(item => ({ ...item, to: masked(item.to) })),
    },
    push: { level: (pushEnabled ? "good" : "warn") as Level, enabled: pushEnabled, devices: devices.n },
    scribe: {
      level: (scribe.speech && scribe.drafting ? "good" : "warn") as Level,
      speechReady: scribe.speech,
      speechRunning: speechRunning(),
      noteModel,
      noteModelInstalled: scribe.drafting,
      noteModelLoaded: loaded,
      reason: scribe.reason,
    },
    database: { ...database, connections: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } },
    server: {
      uptimeMinutes: Math.round(process.uptime() / 60),
      memoryMb: Math.round(memory.rss / 1_048_576),
      node: process.version,
      environment: env.NODE_ENV,
      appUrl: env.APP_URL,
      agencyAddresses: env.AGENCY_ADDRESSES,
    },
    problems: log.problems.slice(0, 20),
  };
}
