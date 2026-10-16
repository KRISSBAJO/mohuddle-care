import * as Location from "expo-location";
import type { Position } from "./api";

/*
 * The phone's position for a clock-in or clock-out. Never blocks a punch: when it cannot be read
 * (permission refused, location off, no fix) the punch goes ahead and the office is told.
 */
export type Reading = { position: Position; error?: undefined } | { position: null; error: string };

export async function readPosition(): Promise<Reading> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") return { position: null, error: "Location is not allowed for Mohuddle. You can still go ahead; your office will see it." };
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 15_000)),
    ]);
    if (!fix) return { position: null, error: "Your location took too long. You can still go ahead; your office will see it." };
    return { position: { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy ?? undefined } };
  } catch {
    return { position: null, error: "Your location could not be read. You can still go ahead; your office will see it." };
  }
}

/* Metres between two points, the same sum the server uses. */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/* "450 m" or "1.4 miles". */
export const distanceWords = (meters: number) => (meters < 1000 ? `${meters} m` : `${(meters / 1609).toFixed(1)} miles`);

/* The same verdict the server reaches, so the screen can say it before the punch is sent. */
export function locationVerdict(home: { latitude: number | null; longitude: number | null } | null, phone: Position | null, radius: number): { state: "ok" | "outside" | "unavailable" | "home_not_set"; distance: number | null } {
  if (!phone) return { state: "unavailable", distance: null };
  if (home?.latitude == null || home?.longitude == null) return { state: "home_not_set", distance: null };
  const distance = distanceMeters({ latitude: home.latitude, longitude: home.longitude }, phone);
  const slack = Math.min(Math.max(phone.accuracy ?? 0, 0), radius);
  return { state: distance <= radius + slack ? "ok" : "outside", distance };
}
