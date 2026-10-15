import { NextResponse } from "next/server";
import { createSession } from "@/server/auth";
import { env } from "@/server/env";
import { hostAgency, redeemHandoff } from "@/server/host";

export const dynamic = "force-dynamic";

/*
 * Arrives at an agency's own address with a one-time pass (from sign-in at the shared page, or the
 * agency switcher), and starts the session here. A pass for another agency's address does nothing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Next reports its own host in request.url; redirects go back to the address the browser used.
  const here = `${new URL(env.APP_URL).protocol}//${request.headers.get("host")}`;
  const agency = await hostAgency();
  const pass = await redeemHandoff(url.searchParams.get("token") ?? "");
  if (!pass || !agency || agency === "missing" || pass.agencyId !== agency.id) {
    return NextResponse.redirect(new URL("/login?reason=handoff", here), { status: 303 });
  }
  await createSession({ id: pass.userId, agencyId: pass.agencyId }, pass.shared);
  const next = url.searchParams.get("next") ?? "/app";
  return NextResponse.redirect(new URL(next.startsWith("/app") || next.startsWith("/owner") ? next : "/app", here), { status: 303 });
}
