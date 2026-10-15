/*
 * Fields placed on an uploaded PDF: where the signer initials, signs, and where the date and their
 * name are printed. Positions are fractions of the page, measured from the top left, so they hold
 * at any zoom. No database access here, so the rules can be tested on their own.
 */

export const FIELD_KINDS = {
  signature: { label: "Signature", w: 0.3, h: 0.07 },
  initials: { label: "Initials", w: 0.1, h: 0.045 },
  date: { label: "Date", w: 0.18, h: 0.03 },
  name: { label: "Printed name", w: 0.26, h: 0.03 },
} as const;
export type FieldKind = keyof typeof FIELD_KINDS;

export type SignField = { id: string; kind: FieldKind; page: number; x: number; y: number; w: number; h: number };

/* The signer acts on these (taps to apply); date and name are filled in for them. */
export const needsAction = (field: Pick<SignField, "kind">) => field.kind === "signature" || field.kind === "initials";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/* Checks fields sent from the editor: known kinds, real pages, inside the page, a sensible size. */
export function cleanFields(raw: unknown, pages: number): { fields: SignField[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "The fields could not be read. Reload and try again." };
  if (raw.length > 400) return { error: "Up to 400 fields can be placed on one document." };
  const fields: SignField[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "The fields could not be read. Reload and try again." };
    const field = item as Record<string, unknown>;
    const kind = field.kind;
    if (typeof kind !== "string" || !(kind in FIELD_KINDS)) return { error: "Unknown field type." };
    const page = Number(field.page);
    if (!Number.isInteger(page) || page < 1 || page > pages) return { error: "A field is on a page the document does not have." };
    const w = clamp(Number(field.w), 0.02, 1);
    const h = clamp(Number(field.h), 0.01, 0.5);
    const x = clamp(Number(field.x), 0, 1 - w);
    const y = clamp(Number(field.y), 0, 1 - h);
    if (![w, h, x, y].every(Number.isFinite)) return { error: "A field has an unreadable position." };
    let id = typeof field.id === "string" && /^[a-z0-9-]{1,40}$/i.test(field.id) ? field.id : `f${fields.length + 1}`;
    while (seen.has(id)) id = `${id}-${fields.length}`;
    seen.add(id);
    const round = (value: number) => Math.round(value * 10_000) / 10_000;
    fields.push({ id, kind: kind as FieldKind, page, x: round(x), y: round(y), w: round(w), h: round(h) });
  }
  if (fields.length && !fields.some(field => field.kind === "signature")) return { error: "Place at least one signature field, or remove all fields to use the standard signature page." };
  return { fields: fields.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x) };
}

/* A field's box in PDF points, which measure from the bottom left. */
export function pdfBox(field: SignField, pageWidth: number, pageHeight: number) {
  return { x: field.x * pageWidth, y: pageHeight - (field.y + field.h) * pageHeight, width: field.w * pageWidth, height: field.h * pageHeight };
}

/* An initials field near the bottom right of every page, for "initial every page" in one click. */
export function initialsOnEveryPage(pages: number, existing: SignField[]): SignField[] {
  const added: SignField[] = [];
  for (let page = 1; page <= pages; page++) {
    if (existing.some(field => field.page === page && field.kind === "initials")) continue;
    added.push({ id: `init-${page}-${Math.random().toString(36).slice(2, 7)}`, kind: "initials", page, x: 0.84, y: 0.92, w: FIELD_KINDS.initials.w, h: FIELD_KINDS.initials.h });
  }
  return [...existing, ...added];
}
