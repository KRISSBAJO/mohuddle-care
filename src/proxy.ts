import { NextResponse, type NextRequest } from "next/server";
import { readHost } from "./lib/agency-host";
import { SESSION_COOKIE } from "./lib/session-cookie";

/*
 * A fast first gate: no session cookie, no Hub. This only checks that the cookie exists.
 * The real check against the database happens in src/app/app/layout.tsx.
 * An agency's own address opens the app, and the shared address opens sign-in, instead of a website.
 */
export function proxy(request: NextRequest) {
  const host = readHost(request.headers.get("host"), new URL(process.env.APP_URL ?? "http://localhost:3400").host);
  if (request.nextUrl.pathname === "/") {
    if (host.kind === "main") return NextResponse.next();
    return NextResponse.redirect(new URL(host.kind === "agency" ? "/app" : "/login", request.url));
  }
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/", "/app/:path*"] };
