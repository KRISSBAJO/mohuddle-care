"use client";

import { useCallback, useEffect, useState } from "react";

export type Position = { latitude: number; longitude: number; accuracy: number };
export type PositionState = { status: "asking" | "ok" | "denied" | "unavailable"; position: Position | null; message: string };

/*
 * Reads the phone's location once, when the page opens, and again on "Try again". Nothing is tracked
 * in the background: the position is only sent with the clock in or clock out.
 */
export function usePosition(enabled: boolean): PositionState & { retry: () => void } {
  const [state, setState] = useState<PositionState>({ status: "asking", position: null, message: "" });

  const read = useCallback(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable", position: null, message: "This browser cannot share a location." });
      return;
    }
    setState(current => ({ ...current, status: "asking", message: "" }));
    navigator.geolocation.getCurrentPosition(
      result => setState({ status: "ok", position: { latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: Math.round(result.coords.accuracy) }, message: "" }),
      error =>
        setState({
          status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
          position: null,
          message: error.code === error.PERMISSION_DENIED ? "Location is blocked for this site. Allow it in your browser settings, then try again." : "Your location could not be found. Step outside or near a window and try again.",
        }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, [enabled]);

  useEffect(() => {
    // Asking for location is the effect here: it starts the browser's own permission prompt.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    read();
  }, [read]);

  return { ...state, retry: read };
}
