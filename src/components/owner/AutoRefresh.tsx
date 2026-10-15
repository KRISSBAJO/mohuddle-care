"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* Reloads the page's data every so often, while it is open. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}
