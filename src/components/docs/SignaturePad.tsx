"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export type PadHandle = { toPng: () => string | null; clear: () => void; isEmpty: () => boolean };

/* Cuts the empty space around a drawing, so the signature sits neatly wherever it is placed. */
export function trimCanvas(source: HTMLCanvasElement, padding = 8) {
  const context = source.getContext("2d")!;
  const { width, height } = source;
  const pixels = context.getImageData(0, 0, width, height).data;
  let top = height,
    left = width,
    right = 0,
    bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 10) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < left || bottom < top) return null;
  const out = document.createElement("canvas");
  out.width = right - left + padding * 2;
  out.height = bottom - top + padding * 2;
  out.getContext("2d")!.drawImage(source, left - padding, top - padding, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/* A pad to sign on with a finger, pen or mouse. Lines are smoothed and drawn in dark ink. */
export const SignaturePad = forwardRef<PadHandle, { height?: number; label: string; onChange?: (empty: boolean) => void }>(function SignaturePad({ height = 160, label, onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const points = useRef<{ x: number; y: number }[]>([]);
  const [empty, setEmpty] = useState(true);

  const setup = useCallback(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = element.getBoundingClientRect();
    element.width = Math.round(rect.width * ratio);
    element.height = Math.round(rect.height * ratio);
    const context = element.getContext("2d")!;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0b2239";
    context.lineWidth = 2.6;
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  const mark = (value: boolean) => {
    setEmpty(value);
    onChange?.(value);
  };

  useImperativeHandle(ref, () => ({
    toPng: () => (canvas.current && !empty ? trimCanvas(canvas.current) : null),
    clear: () => {
      setup();
      mark(true);
    },
    isEmpty: () => empty,
  }));

  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-line bg-white">
        <canvas
          ref={canvas}
          aria-label={label}
          role="img"
          className="block w-full touch-none cursor-crosshair"
          style={{ height }}
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = true;
            points.current = [position(event)];
            const context = canvas.current!.getContext("2d")!;
            const point = points.current[0];
            context.beginPath();
            context.arc(point.x, point.y, 1.2, 0, Math.PI * 2);
            context.fillStyle = "#0b2239";
            context.fill();
            if (empty) mark(false);
          }}
          onPointerMove={event => {
            if (!drawing.current) return;
            const context = canvas.current!.getContext("2d")!;
            points.current.push(position(event));
            const list = points.current;
            if (list.length < 3) return;
            const [a, b, c] = list.slice(-3);
            context.beginPath();
            context.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
            context.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
            context.stroke();
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerLeave={() => {
            drawing.current = false;
          }}
        />
        <span className="pointer-events-none absolute bottom-3 left-4 right-4 border-b border-line" aria-hidden="true" />
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-dim">{label}</span>}
      </div>
      <button
        type="button"
        onClick={() => {
          setup();
          mark(true);
        }}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-mute hover:text-ink"
      >
        <Eraser className="h-3.5 w-3.5" /> Clear
      </button>
    </div>
  );
});

export const SIGNATURE_FONTS = [
  { family: "Sig Dancing", label: "Flowing" },
  { family: "Sig Vibes", label: "Formal" },
  { family: "Sig Caveat", label: "Casual" },
  { family: "Sig Apple", label: "Handwritten" },
] as const;

/* Renders typed text in a handwriting font as a trimmed PNG, once the font has loaded. */
export async function typedToPng(text: string, family: string, size = 72) {
  await document.fonts.load(`${size}px "${family}"`);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = `${size}px "${family}"`;
  const width = Math.ceil(context.measureText(text).width) + size;
  canvas.width = width;
  canvas.height = Math.ceil(size * 1.9);
  const draw = canvas.getContext("2d")!;
  draw.font = `${size}px "${family}"`;
  draw.fillStyle = "#0b2239";
  draw.textBaseline = "middle";
  draw.fillText(text, size / 2, canvas.height / 2);
  return trimCanvas(canvas);
}
