"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";
import { signOut, signOutIdle } from "@/server/actions/auth";

const KEY = "mohuddle-last-activity";
const WARN_MS = 2 * 60_000;
const PING_EVERY_MS = 2 * 60_000;

function readShared(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

/*
 * Signs people out after the agency's idle time, so an unattended phone or tablet does not stay open
 * on someone's records. Activity in any tab counts. Two minutes before, it asks "Still there?".
 * While someone is active, the server is told now and then, so a long note does not time out.
 */
export function IdleGuard({ idleMinutes }: { idleMinutes: number }) {
  const router = useRouter();
  // Held in a ref: the timer must start once per page, not again whenever the router object changes.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const idleMs = idleMinutes * 60_000;
  const last = useRef(0);
  const lastPing = useRef(0);
  const [left, setLeft] = useState<number | null>(null);
  const signingOut = useRef(false);

  useEffect(() => {
    last.current = Date.now();
    const ping = () => {
      lastPing.current = Date.now();
      void fetch("/api/session/ping", { method: "POST" }).then(response => {
        if (response.status === 401 && !signingOut.current) routerRef.current.push("/login?reason=idle");
      }).catch(() => undefined);
    };
    const active = () => {
      const now = Date.now();
      if (now - last.current < 2000) return;
      last.current = now;
      try {
        localStorage.setItem(KEY, String(now));
      } catch {
        // Private windows may refuse storage; this tab still tracks its own activity.
      }
      if (now - lastPing.current > PING_EVERY_MS) ping();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const;
    events.forEach(name => window.addEventListener(name, active, { passive: true, capture: true }));
    ping();
    const tick = setInterval(() => {
      const idle = Date.now() - Math.max(last.current, readShared());
      if (idle >= idleMs) {
        if (!signingOut.current) {
          signingOut.current = true;
          void signOutIdle();
        }
        return;
      }
      setLeft(idle >= idleMs - WARN_MS ? Math.ceil((idleMs - idle) / 1000) : null);
    }, 1000);
    return () => {
      events.forEach(name => window.removeEventListener(name, active, { capture: true }));
      clearInterval(tick);
    };
  }, [idleMs]);

  // The marker lets support staff (and tests) see the limit this page is using.
  if (left === null) return <span hidden data-idle-minutes={idleMinutes} />;
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-text">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-[#8a5a10]"><Clock3 className="h-6 w-6" /></span>
        <h2 id="idle-title" className="mt-4 text-xl font-bold">Still there?</h2>
        <p id="idle-text" className="mt-2 text-sm text-mute">
          To keep people&apos;s information safe, you will be signed out in <span className="font-semibold tabular-nums text-ink">{minutes}:{seconds}</span>.
        </p>
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            autoFocus
            className="btn-brand justify-center"
            onClick={() => {
              last.current = 0;
              window.dispatchEvent(new Event("pointerdown"));
              setLeft(null);
            }}
          >
            Stay signed in
          </button>
          <form action={signOut}>
            <button type="submit" className="btn-ghost w-full justify-center">Sign out now</button>
          </form>
        </div>
      </div>
    </div>
  );
}
