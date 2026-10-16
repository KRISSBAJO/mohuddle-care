import "server-only";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { DocumentError } from "./service";

/*
 * Signature and initials images for the phone app, which cannot draw on a canvas the way the
 * website does. The phone sends what was typed (with a handwriting font) or the lines drawn with a
 * finger; this draws the same kind of PNG the website sends, for signItem to place on the document.
 */

export const SIGNATURE_FONTS = { caveat: "Caveat", dancing: "Dancing Script", vibes: "Great Vibes", apple: "Homemade Apple" } as const;
export type SignatureFont = keyof typeof SIGNATURE_FONTS;

const FONT_FILES = ["Caveat.ttf", "DancingScript.ttf", "GreatVibes.ttf", "HomemadeApple.ttf"].map(file => path.join(process.cwd(), "public", "fonts", file));
const INK = "#1d2b4f";
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/* A line drawn with a finger: points in the drawing box's own units. */
export type Stroke = [number, number][];

function render(svg: string) {
  const png = new Resvg(svg, { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Caveat" }, background: "rgba(0,0,0,0)" }).render().asPng();
  return Buffer.from(png);
}

/* A typed name in a handwriting font. */
export function typedImage(text: string, font: SignatureFont, kind: "signature" | "initials") {
  const value = text.trim();
  if (!value) throw new DocumentError(`Type your ${kind}.`);
  const [width, height, size] = kind === "signature" ? [600, 160, 64] : [240, 140, 64];
  return render(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="${width / 2}" y="${height * 0.66}" text-anchor="middle" font-family="${SIGNATURE_FONTS[font]}" font-size="${size}" fill="${INK}">${escape(value.slice(0, 60))}</text></svg>`);
}

/* Finger strokes, scaled into the image. The box is the size of the pad the person drew on. */
export function drawnImage(strokes: Stroke[], box: { width: number; height: number }, kind: "signature" | "initials") {
  const points = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  if (points < 8) throw new DocumentError(`Draw your ${kind}.`);
  const [width, height] = kind === "signature" ? [600, 200] : [240, 160];
  const scale = Math.min(width / Math.max(1, box.width), height / Math.max(1, box.height));
  const d = strokes
    .filter(stroke => stroke.length)
    .map(stroke => stroke.map(([x, y], index) => `${index ? "L" : "M"}${(x * scale).toFixed(1)} ${(y * scale).toFixed(1)}`).join(" "))
    .join(" ");
  return render(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${d}" fill="none" stroke="${INK}" stroke-width="${(3.2 * Math.max(1, scale)).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
}
