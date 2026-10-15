"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type PdfDocument = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfPage = { getViewport: (options: { scale: number }) => { width: number; height: number }; render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } };

/* One page drawn to a canvas at the width it is shown, sharp on high-density screens. */
function Page({ doc, number, children }: { doc: PdfDocument; number: number; children?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.294);

  useEffect(() => {
    let cancelled = false;
    let drawnWidth = 0;
    const draw = async () => {
      const element = box.current;
      const target = canvas.current;
      if (!element || !target) return;
      const width = element.clientWidth;
      if (!width || Math.abs(width - drawnWidth) < 4) return;
      drawnWidth = width;
      const page = await doc.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      target.width = Math.floor(viewport.width);
      target.height = Math.floor(viewport.height);
      const context = target.getContext("2d");
      if (context) await page.render({ canvasContext: context, viewport }).promise.catch(() => undefined);
    };
    void draw();
    const resize = new ResizeObserver(() => void draw());
    if (box.current) resize.observe(box.current);
    return () => {
      cancelled = true;
      resize.disconnect();
    };
  }, [doc, number]);

  return (
    <div ref={box} id={`pdf-page-${number}`} data-page={number} className="relative w-full scroll-mt-28 overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(15,23,42,.12),0_12px_30px_-18px_rgba(15,23,42,.35)]" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Page ${number}`} />
      {children}
    </div>
  );
}

/*
 * A PDF shown page by page in the browser (Mozilla's pdf.js), with room to lay boxes over each page:
 * fields in the editor, places to initial and sign for the signer. Overlay positions are fractions of
 * the page, so they line up at any width.
 */
export function PdfPages({ url, overlay, className = "" }: { url: string; overlay?: (page: number) => React.ReactNode; className?: string }) {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDocument | null = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      loaded = (await pdfjs.getDocument({ url, withCredentials: true }).promise) as unknown as PdfDocument;
      if (cancelled) return void loaded.destroy();
      setDoc(loaded);
    })().catch(() => !cancelled && setError("This PDF could not be shown. Reload the page, or download it instead."));
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [url]);

  if (error) return <p className="rounded-xl bg-flag-soft px-4 py-3 text-sm text-flag" role="alert">{error}</p>;
  if (!doc) return <p className="flex items-center gap-2 py-10 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" /> Opening the document…</p>;
  return (
    <div className={`space-y-5 ${className}`}>
      {Array.from({ length: doc.numPages }, (_, index) => (
        <div key={index}>
          <p className="mb-1.5 text-xs font-semibold text-mute">Page {index + 1} of {doc.numPages}</p>
          <Page doc={doc} number={index + 1}>{overlay?.(index + 1)}</Page>
        </div>
      ))}
    </div>
  );
}
