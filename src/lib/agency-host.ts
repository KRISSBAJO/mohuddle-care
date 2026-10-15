/*
 * Each agency has its own web address: slug.mohuddle.com when live, slug.localhost:3400 on this
 * machine. app.<base> is the shared sign-in page. The base itself (mohuddle.com, localhost:3400)
 * works as before. The base comes from APP_URL.
 */

export type HostKind = { kind: "agency"; slug: string } | { kind: "shared" } | { kind: "admin" } | { kind: "main" };

export function readHost(host: string | null | undefined, baseHost: string): HostKind {
  const name = (host ?? "").toLowerCase();
  const base = baseHost.toLowerCase();
  if (!name.endsWith(`.${base}`)) return { kind: "main" };
  const sub = name.slice(0, -(base.length + 1));
  if (!sub || sub.includes(".") || sub === "www") return { kind: "main" };
  if (sub === "app") return { kind: "shared" };
  if (sub === "admin") return { kind: "admin" };
  return { kind: "agency", slug: sub };
}

/* The origin of an agency's own address, such as https://milestone.mohuddle.com. */
export function agencyOrigin(slug: string, appUrl: string) {
  const url = new URL(appUrl);
  return `${url.protocol}//${slug}.${url.host}`;
}

/* The origin of the owner console, such as https://admin.mohuddle.com. */
export const adminOrigin = (appUrl: string) => agencyOrigin("admin", appUrl);

/* The origin of the shared sign-in page, such as https://app.mohuddle.com. */
export const sharedOrigin = (appUrl: string) => agencyOrigin("app", appUrl);
