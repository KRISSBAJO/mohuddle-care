import "server-only";
import { connection } from "next/server";

// Request-time clock: these operational screens must never use a build-time timestamp.
export async function requestTime() {
  await connection();
  return Date.now();
}
