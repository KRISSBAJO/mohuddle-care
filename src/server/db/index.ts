import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

// One pool per process. The module reloads often in development, so the pool is kept on globalThis.
const globalForDb = globalThis as unknown as { milestonePool?: Pool };

export const pool =
  globalForDb.milestonePool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  });
if (env.NODE_ENV !== "production") globalForDb.milestonePool = pool;

export const db = drizzle(pool, { schema });
export { schema };
