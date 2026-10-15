"use client";

import { setBrowserZone } from "@/lib/format";

/*
 * Tells the date helpers in the browser which time zone this agency uses. It renders before the page
 * itself, so every time shown in the browser agrees with the server. The server has its own source.
 */
export function ZoneSync({ zone }: { zone: string }) {
  if (typeof window !== "undefined") setBrowserZone(zone);
  return null;
}
