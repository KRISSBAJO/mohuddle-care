"use client";

import { useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";

/*
 * A home's map location for the time clock. The easiest way to set it is to stand in the home and
 * press "Use where I am now"; it can also be typed from a map.
 */
export function HomeLocationFields({ latitude, longitude, address }: { latitude: number | null; longitude: number | null; address: string }) {
  const [lat, setLat] = useState(latitude?.toFixed(6) ?? "");
  const [lng, setLng] = useState(longitude?.toFixed(6) ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function here() {
    if (!navigator.geolocation) return setMessage("This browser cannot share a location.");
    setBusy(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      result => {
        setLat(result.coords.latitude.toFixed(6));
        setLng(result.coords.longitude.toFixed(6));
        setMessage(`Found, accurate to about ${Math.round(result.coords.accuracy)} m. Save to keep it.`);
        setBusy(false);
      },
      () => {
        setMessage("Your location could not be read. Allow location for this site and try again.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="home-lat" className="label">Latitude</label>
          <input id="home-lat" name="latitude" inputMode="decimal" className="field font-mono" value={lat} onChange={event => setLat(event.target.value)} placeholder="36.162700" />
        </div>
        <div>
          <label htmlFor="home-lng" className="label">Longitude</label>
          <input id="home-lng" name="longitude" inputMode="decimal" className="field font-mono" value={lng} onChange={event => setLng(event.target.value)} placeholder="-86.781600" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={here} disabled={busy} className="btn-ghost btn-sm">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />} Use where I am now
        </button>
        {lat && lng && (
          <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand">Check on a map</a>
        )}
        {address && !lat && (
          <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand">Find the address on a map</a>
        )}
      </div>
      {message && <p className="text-xs text-mute">{message}</p>}
    </div>
  );
}
