import "server-only";
import { randomUUID } from "node:crypto";
import type { EmailContent } from "@/lib/email-templates";
import { requireAgency } from "./agency";
import { db, schema } from "./db";
import { env } from "./env";

/*
 * Sending email. Nothing leaves this machine unless EMAIL_PROVIDER is relykit with a key: the
 * default only writes to the log. Every send is recorded in email_messages (never the body, which
 * can carry a one-time link), and a failed send never stops what the person was doing: callers
 * still show the link on screen.
 */

type Outgoing = { from: string; to: string; replyTo?: string; subject: string; text: string; html: string; idempotencyKey: string };
type Result = { status: "sent" | "queued" | "failed"; providerId: string | null; detail: string };

// Domains that can never receive mail (RFC 2606 and 6761), and the example domains with a null MX.
const RESERVED_SUFFIXES = [".test", ".example", ".invalid", ".localhost"];
const RESERVED_EXACT = new Set(["localhost", "example.com", "example.net", "example.org"]);

/* An address that cannot receive mail. Never handed to a real provider: each would bounce, and bounces count against the account. */
export function isReservedAddress(address: string) {
  const domain = address.slice(address.lastIndexOf("@") + 1).trim().toLowerCase().replace(/\.$/, "");
  if (RESERVED_EXACT.has(domain) || [...RESERVED_EXACT].some(exact => domain.endsWith(`.${exact}`))) return true;
  return RESERVED_SUFFIXES.some(suffix => domain.endsWith(suffix) || domain === suffix.slice(1));
}

async function relyKit(email: Outgoing): Promise<Result> {
  const body: Record<string, unknown> = { from: email.from, to: [email.to], subject: email.subject, text: email.text, html: email.html };
  if (email.replyTo) body.reply_to = [email.replyTo];
  let response: Response;
  try {
    response = await fetch(`${env.RELYKIT_URL.replace(/\/$/, "")}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.RELYKIT_API_KEY}`, "content-type": "application/json", "Idempotency-Key": email.idempotencyKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return { status: "failed", providerId: null, detail: `Could not reach RelyKit: ${(error as Error).message}` };
  }
  const payload = (await response.json().catch(() => ({}))) as { id?: string; status?: string; name?: string; message?: string; last_error?: string };
  if (!response.ok) return { status: "failed", providerId: null, detail: `${response.status} ${payload.name ?? ""} ${payload.message ?? ""}`.trim() };
  // A suppressed address comes back accepted but cancelled: nobody will receive it.
  if (payload.status === "cancelled") return { status: "failed", providerId: payload.id ?? null, detail: payload.last_error ?? "This address is on the suppression list." };
  return { status: payload.status === "sent" || payload.status === "delivered" ? "sent" : "queued", providerId: payload.id ?? null, detail: payload.status ?? "" };
}

/* "Milestone via Mohuddle <noreply@…>", from EMAIL_FROM. */
function fromLine(agencyName: string) {
  const match = env.EMAIL_FROM.match(/<([^>]+)>/);
  const address = (match ? match[1] : env.EMAIL_FROM).trim();
  return `"${agencyName.replace(/["\\]/g, "")} via Mohuddle" <${address}>`;
}

export type SendResult = { status: "sent" | "queued" | "failed" | "skipped"; detail: string };

/*
 * Sends one email as the current agency and records it. The agency's name goes in the sender and its
 * office email is where replies go.
 */
export async function sendEmail(kind: string, to: string, content: EmailContent, createdBy: string | null = null): Promise<SendResult> {
  const agency = await requireAgency();
  const address = to.trim().toLowerCase();
  let provider: string = env.EMAIL_PROVIDER;
  let result: Result;
  if (!address.includes("@")) {
    result = { status: "failed", providerId: null, detail: "No email address." };
  } else if (env.EMAIL_PROVIDER === "relykit" && isReservedAddress(address)) {
    result = { status: "failed", providerId: null, detail: "Not sent: a test address that cannot receive mail." };
  } else if (env.EMAIL_PROVIDER === "relykit" && env.RELYKIT_API_KEY) {
    result = await relyKit({ from: fromLine(agency.name), to: address, replyTo: agency.email || undefined, subject: content.subject, text: content.text, html: content.html, idempotencyKey: randomUUID() });
  } else {
    provider = "console";
    console.log(`[email:console] ${kind} to ${address}: "${content.subject}"`);
    result = { status: "queued", providerId: null, detail: "Not delivered: email sending is off on this server (EMAIL_PROVIDER)." };
  }
  await db.insert(schema.emailMessages).values({ kind, toAddress: address, subject: content.subject, status: result.status, provider, providerId: result.providerId, detail: result.detail.slice(0, 500), createdBy });
  return { status: provider === "console" ? "skipped" : result.status, detail: result.detail };
}

/* A short line for the person who issued a link, saying whether it was emailed too. */
export function emailNote(to: string, result: SendResult | null) {
  if (!result) return undefined;
  if (result.status === "sent" || result.status === "queued") return `We also emailed it to ${to}.`;
  if (result.status === "skipped") return `Email is not switched on for this server, so give them the link yourself.`;
  return `We could not email it to ${to} (${result.detail}), so give them the link yourself.`;
}
