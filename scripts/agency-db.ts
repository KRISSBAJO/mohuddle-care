import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "../src/server/db/schema";

/*
 * A database connection for scripts, working as one agency under the same row rules as the app.
 * The agency is AGENCY (its slug) from the environment, or milestone.
 */
export function agencyDb(slug = process.env.AGENCY ?? "milestone") {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  let agencyId: Promise<string> | null = null;
  const lookUp = async () => {
    const owner = new Pool({ connectionString: url, max: 1 });
    try {
      const { rows } = await owner.query<{ id: string }>("select id from agencies where slug = $1", [slug]);
      if (!rows[0]) throw new Error(`There is no agency called "${slug}".`);
      return rows[0].id;
    } finally {
      await owner.end();
    }
  };

  class ScriptPool extends Pool {
    connect(): Promise<PoolClient>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg's own callback type
    connect(callback: (error: Error | undefined, client: PoolClient | undefined, done: (release?: any) => void) => void): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg's own callback type
    connect(callback?: (error: Error | undefined, client: PoolClient | undefined, done: (release?: any) => void) => void): Promise<PoolClient> | void {
      agencyId ??= lookUp();
      const ready = agencyId.then(async id => {
        const client = (await super.connect()) as PoolClient & { agencySet?: boolean };
        if (!client.agencySet) {
          await client.query("select set_config('role', 'mohuddle_app', false), set_config('app.agency_id', $1, false)", [id]);
          client.agencySet = true;
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

  const pool = new ScriptPool({ connectionString: url, max: 4 });
  return { pool, db: drizzle(pool, { schema }), agencyId: () => (agencyId ??= lookUp()) };
}
