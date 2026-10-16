import { destroyDeviceSession } from "@/server/auth";
import { reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

/* Ends this phone's session. Always succeeds, so a phone can sign out even with an old token. */
export async function POST() {
  await destroyDeviceSession();
  return reply({ ok: true });
}
