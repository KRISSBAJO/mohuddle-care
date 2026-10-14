"use client";

import { useEffect, useState } from "react";
import { BellRing, Smartphone } from "lucide-react";

type State = "loading" | "unsupported" | "ios-install" | "blocked" | "off" | "on" | "working";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function deviceName() {
  const agent = navigator.userAgent;
  const os = /iphone/i.test(agent) ? "iPhone" : /ipad/i.test(agent) ? "iPad" : /android/i.test(agent) ? "Android" : /windows/i.test(agent) ? "Windows" : /mac/i.test(agent) ? "Mac" : "Device";
  const browser = /edg\//i.test(agent) ? "Edge" : /chrome|crios/i.test(agent) ? "Chrome" : /firefox|fxios/i.test(agent) ? "Firefox" : /safari/i.test(agent) ? "Safari" : "browser";
  return `${os}, ${browser}`;
}

/*
 * Phone and computer notifications for this device: shift reminders, breaks and alerts arrive even
 * when Mohuddle is closed. iPhones only allow this once Mohuddle is added to the Home Screen.
 */
export function PushControl({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      if (!publicKey) return setState("unsupported");
      if (isIos() && !isInstalled()) return setState("ios-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      setState(existing && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [publicKey]);

  async function turnOn() {
    setError("");
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const response = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...subscription.toJSON(), device: deviceName(), test: true }) });
      if (!response.ok) throw new Error();
      setState("on");
    } catch {
      setError("Could not turn on notifications on this device. Try again, or check the browser's site settings.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("working");
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
      await subscription.unsubscribe().catch(() => undefined);
    }
    setState("off");
  }

  if (state === "loading" || state === "unsupported") return null;
  return (
    <div className="border-t border-line bg-panel/50 px-4 py-3 text-xs">
      {state === "ios-install" ? (
        <p className="flex gap-2 text-mute"><Smartphone className="h-4 w-4 shrink-0 text-brand" /> For alerts on this iPhone, tap Share, then Add to Home Screen, and open Mohuddle from there.</p>
      ) : state === "blocked" ? (
        <p className="flex gap-2 text-mute"><BellRing className="h-4 w-4 shrink-0 text-flag" /> Notifications are blocked for this site. Allow them in the browser&apos;s site settings.</p>
      ) : (
        <div className="flex items-center gap-2">
          <BellRing className={state === "on" ? "h-4 w-4 shrink-0 text-sage" : "h-4 w-4 shrink-0 text-mute"} />
          <span className="min-w-0 flex-1 text-mute">{state === "on" ? "Alerts are on for this device." : "Get shift reminders and alerts on this device, even when Mohuddle is closed."}</span>
          {state === "on" ? (
            <button type="button" onClick={turnOff} className="font-semibold text-mute hover:text-ink">Turn off</button>
          ) : (
            <button type="button" onClick={turnOn} disabled={state === "working"} className="shrink-0 font-semibold text-brand disabled:opacity-50">{state === "working" ? "Turning on…" : "Turn on"}</button>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-1.5 text-flag">{error}</p>}
    </div>
  );
}
