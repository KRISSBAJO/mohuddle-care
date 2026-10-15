"use client";

import { useEffect, useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

/*
 * When a page or a change fails. The layout stays around it, so its notices (such as a read-only
 * subscription) are still on screen above this.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    console.error(error);
    // The layout marks an agency whose subscription lapsed; read after the page has drawn.
    const timer = window.setTimeout(() => setReadOnly(Boolean(document.querySelector("[data-readonly]"))), 0);
    return () => window.clearTimeout(timer);
  }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-lg px-6 py-10 text-center">
      <TriangleAlert className="mx-auto h-10 w-10 text-flag" />
      <h1 className="mt-4 text-xl font-bold">{readOnly ? "This change was not saved" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-mute">
        {readOnly
          ? "Mohuddle is read-only for your agency until its subscription is renewed. You can still look at everything."
          : "The page could not finish. Try again; if it keeps happening, tell your administrator what you were doing."}
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-dim">Reference {error.digest}</p>}
      <button type="button" onClick={reset} className="btn-brand mt-6 inline-flex"><RotateCcw className="h-4 w-4" /> Go back</button>
    </div>
  );
}
