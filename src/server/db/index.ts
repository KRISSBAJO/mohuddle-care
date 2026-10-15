import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { DEFAULT_ZONE, setZoneSource } from "@/lib/format";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { env } from "../env";
import { sessionTokenHash } from "../session-token";
import { requestZone } from "../zone";
import * as schema from "./schema";

/*
 * Every agency's data is in the same tables, each row tagged with its agency. The app's queries run
 * as the mohuddle_app role, which Postgres row rules limit to the agency set on the connection
 * (app.agency_id, see drizzle/0029). With no agency set, nothing is visible and nothing can be written.
 *
 * The agency is the one asAgency() names, or else the signed-in session's.
 */

const APP_ROLE = "mohuddle_app";

// Next can load this module more than once (pages, route handlers). Every copy must share one
// agency store and one pool, or an agency set through one copy would not reach the other's pool.
const shared = globalThis as unknown as {
  mohuddleAgencyContext?: AsyncLocalStorage<{ agencyId: string | null; zone: string | null }>;
  mohuddleZones?: Map<string, { zone: string; at: number }>;
  mohuddleSessionAgencies?: Map<string, { agencyId: string; at: number }>;
  mohuddlePool?: Pool;
  mohuddleSystemPool?: Pool;
};
const context = (shared.mohuddleAgencyContext ??= new AsyncLocalStorage());

/*
 * Runs fn as one agency, whatever the session says: for timed jobs, private links and sign-in. Null
 * means no agency. Dates inside use that agency's time zone.
 */
export async function asAgency<T>(agencyId: string | null, fn: () => PromiseLike<T>): Promise<T> {
  const zone = agencyId ? await agencyZone(agencyId) : null;
  // Awaited inside, so a query builder (which only runs when awaited) runs as this agency too.
  return context.run({ agencyId, zone }, async () => await fn());
}

// An agency's time zone, kept for a minute so jobs and links do not look it up every time.
const zones = (shared.mohuddleZones ??= new Map());

export async function agencyZone(agencyId: string): Promise<string> {
  const kept = zones.get(agencyId);
  if (kept && Date.now() - kept.at < 60_000) return kept.zone;
  const { rows } = await systemPool.query<{ timezone: string }>("select timezone from agencies where id = $1", [agencyId]);
  const zone = rows[0]?.timezone ?? DEFAULT_ZONE;
  zones.set(agencyId, { zone, at: Date.now() });
  return zone;
}

// The date helpers ask here: the agency code chose with asAgency, or else the signed-in request's.
setZoneSource(() => {
  const chosen = context.getStore();
  if (chosen) return chosen.zone ?? DEFAULT_ZONE;
  return requestZone();
});

// A session's agency never changes (switching agency starts a new session), so it is kept for a while.
const sessionAgencies = (shared.mohuddleSessionAgencies ??= new Map());
const KEEP_MS = 5 * 60_000;

async function agencyOfSession(token: string) {
  const hash = sessionTokenHash(token);
  const kept = sessionAgencies.get(hash);
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.agencyId;
  const { rows } = await systemPool.query<{ agency_id: string }>("select agency_id from sessions where token_hash = $1", [hash]);
  const agencyId = rows[0]?.agency_id ?? null;
  if (!agencyId) return null;
  if (sessionAgencies.size > 10_000) sessionAgencies.clear();
  sessionAgencies.set(hash, { agencyId, at: Date.now() });
  return agencyId;
}

/* The agency this code is working for, or an empty string when there is none. */
export async function currentAgencyId(): Promise<string> {
  const chosen = context.getStore();
  if (chosen) return chosen.agencyId ?? "";
  let token: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch (error) {
    // Scripts, tests and timers have no request, so no session.
    if (error instanceof Error && error.message.includes("outside a request scope")) return "";
    throw error;
  }
  return token ? ((await agencyOfSession(token)) ?? "") : "";
}

type AgencyClient = PoolClient & { mohuddleAgency?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg's own callback type
type ConnectCallback = (error: Error | undefined, client: PoolClient | undefined, done: (release?: any) => void) => void;

/*
 * Hands out connections already switched to the app role and the current agency. pg's own
 * pool.query() connects through this too, so no query can skip it.
 */
class AgencyPool extends Pool {
  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    const ready = currentAgencyId().then(async agencyId => {
      const client = (await super.connect()) as AgencyClient;
      if (client.mohuddleAgency !== agencyId) {
        try {
          await client.query("select set_config('role', $1, false), set_config('app.agency_id', $2, false)", [APP_ROLE, agencyId]);
        } catch (error) {
          client.release(error as Error);
          throw error;
        }
        client.mohuddleAgency = agencyId;
      }
      return client;
    });
    if (!callback) return ready;
    ready.then(
      client => callback(undefined, client, client.release),
      error => callback(error as Error, undefined, () => {}),
    );
  }
}

const options = { connectionString: env.DATABASE_URL, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000 };

// One pool of each per process, shared by every copy of this module and kept across reloads.
export const pool = (shared.mohuddlePool ??= new AgencyPool({ ...options, max: 10 }));

/*
 * The database owner, which row rules do not limit. Only for what comes before an agency is known
 * (sign-in, setup links, private document links) and for jobs that visit every agency in turn.
 */
export const systemPool = (shared.mohuddleSystemPool ??= new Pool({ ...options, max: 4 }));

export const db = drizzle(pool, { schema });
export const systemDb = drizzle(systemPool, { schema });
export { schema };
