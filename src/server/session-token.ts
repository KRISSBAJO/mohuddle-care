import "server-only";
import { createHash } from "node:crypto";
import { env } from "./env";

/* Only a hash of a session token is stored. Shared by the auth module and the database connection. */
export const sessionTokenHash = (token: string) => createHash("sha256").update(token + env.SESSION_SECRET).digest("hex");
