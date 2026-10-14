/*
 * Document rules shared by the server and the screens: which files are accepted, where a document
 * stands, and what a staff member, person or home is still missing. No database code, so it is tested.
 */

export const ACCEPTED = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "image/jpeg": { ext: "jpg", label: "JPEG photo" },
  "image/png": { ext: "png", label: "PNG image" },
  "image/webp": { ext: "webp", label: "WebP image" },
  "image/heic": { ext: "heic", label: "iPhone photo (HEIC)" },
} as const;
export type AcceptedType = keyof typeof ACCEPTED;
export const ACCEPT_ATTR = Object.keys(ACCEPTED).join(",") + ",.pdf,.jpg,.jpeg,.png,.webp,.heic";

/*
 * The real type of a file from its first bytes, ignoring what the browser claims. Anything else is
 * refused, so a renamed program or script can never be stored as a "PDF".
 */
export function sniffType(head: Uint8Array): AcceptedType | null {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return "image/webp";
  const brand = String.fromCharCode(...head.slice(4, 12));
  if (brand.startsWith("ftyp") && /heic|heix|mif1|msf1|hevc/.test(brand.slice(4))) return "image/heic";
  return null;
}

/* A file name that is safe to store and to send back in a download header. */
export function safeFileName(name: string, type: AcceptedType) {
  const base = name
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "document"}.${ACCEPTED[type].ext}`;
}

export function addMonths(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export type DocStatus = "submitted" | "approved" | "rejected" | "superseded" | "archived";
export type DocLike = { status: DocStatus; expiresOn: string | null };

/* Where a single stored document stands today. */
export type DocState = "pending_review" | "valid" | "expiring" | "expired" | "rejected" | "superseded" | "archived";
export const DOC_STATE = {
  pending_review: { text: "Waiting for review", tone: "warn" },
  valid: { text: "Valid", tone: "good" },
  expiring: { text: "Expiring soon", tone: "warn" },
  expired: { text: "Expired", tone: "bad" },
  rejected: { text: "Returned", tone: "bad" },
  superseded: { text: "Replaced", tone: "neutral" },
  archived: { text: "Archived", tone: "neutral" },
} as const;

export function docState(doc: DocLike, today: string, reminderDays: number): DocState {
  if (doc.status === "submitted") return "pending_review";
  if (doc.status !== "approved") return doc.status;
  if (doc.expiresOn && doc.expiresOn < today) return "expired";
  if (doc.expiresOn && daysUntil(today, doc.expiresOn) <= reminderDays) return "expiring";
  return "valid";
}

export const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/* Where a requirement stands for one staff member, person or home: the best current document decides. */
export type RequirementState = "missing" | "requested" | "pending_review" | "rejected" | "valid" | "expiring" | "expired";
export const REQUIREMENT_STATE = {
  missing: { text: "Missing", tone: "bad", short: "Missing" },
  requested: { text: "Requested", tone: "brand", short: "Asked" },
  pending_review: { text: "Waiting for review", tone: "warn", short: "Review" },
  rejected: { text: "Returned to redo", tone: "bad", short: "Redo" },
  valid: { text: "On file", tone: "good", short: "OK" },
  expiring: { text: "Expiring soon", tone: "warn", short: "Soon" },
  expired: { text: "Expired", tone: "bad", short: "Expired" },
} as const;

export function requirementState(docs: DocLike[], today: string, reminderDays: number, requested: boolean): RequirementState {
  const states = docs.map(doc => docState(doc, today, reminderDays));
  if (states.includes("valid")) return "valid";
  if (states.includes("expiring")) return "expiring";
  if (states.includes("pending_review")) return "pending_review";
  if (states.includes("expired")) return requested ? "requested" : "expired";
  if (requested) return "requested";
  if (states.includes("rejected")) return "rejected";
  return "missing";
}

/* Whether a staff document type applies to someone in this role. No roles means everyone. */
export const appliesToRole = (roles: string[], role: string) => roles.length === 0 || roles.includes(role);

export const formatBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
