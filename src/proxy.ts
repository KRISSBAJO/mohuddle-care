import { NextResponse, type NextRequest } from "next/server";
import { adminOrigin, readHost } from "./lib/agency-host";
import { SESSION_COOKIE } from "./lib/session-cookie";

const APP_URL = process.env.APP_URL ?? "http://localhost:3400";
const OWNER_COOKIE = "ms_owner";
const OWNER_OPEN = ["/owner/login", "/owner/verify", "/owner/setup"];

/*
 * A fast first gate: no session cookie, no Hub. This only checks that the cookie exists; the real
 * checks against the database happen in the layouts.
 * - An agency's own address opens the app, and the shared address opens sign-in, instead of a website.
 * - The owner console lives at admin.<host> when agencies have addresses, and nowhere else.
 */
export function proxy(request: NextRequest) {
  const host = readHost(request.headers.get("host"), new URL(APP_URL).host);
  const path = request.nextUrl.pathname;
  const addresses = process.env.AGENCY_ADDRESSES === "on";

  if (path === "/") {
    if (host.kind === "main") {
      return process.env.PUBLIC_SITE === "mohuddle"
        ? NextResponse.rewrite(new URL("/mohuddle", request.url))
        : NextResponse.next();
    }
    return NextResponse.redirect(new URL(host.kind === "agency" ? "/app" : host.kind === "admin" ? "/owner" : "/login", request.url));
  }

  if (path === "/owner" || path.startsWith("/owner/")) {
    // With agency addresses, the console opens only on the admin address.
    if (addresses && host.kind !== "admin") return NextResponse.redirect(new URL(path + request.nextUrl.search, adminOrigin(APP_URL)));
    if (OWNER_OPEN.includes(path) || request.cookies.get(OWNER_COOKIE)?.value) return NextResponse.next();
    return NextResponse.redirect(new URL("/owner/login", request.url));
  }

  // The admin address has only the owner console.
  if (host.kind === "admin") return NextResponse.redirect(new URL("/owner", request.url));
  if (path === "/login") return NextResponse.next();

  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/", "/app/:path*", "/owner", "/owner/:path*", "/login"] };
