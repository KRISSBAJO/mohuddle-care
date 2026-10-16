import "server-only";
import type { AssistantReply } from "@/lib/assistant";

/* A link in a phone answer: a screen in the app, or a page that only the website has. */
export type PhoneLink = { label: string; screen?: string; web?: string };
export type PhoneReply = Omit<AssistantReply, "links" | "confirm"> & {
  links: PhoneLink[];
  confirm?: { action: "clock_in"; title: string; detail: string } | { action: "break_start"; options: { kind: "meal" | "rest"; label: string }[] } | { action: "break_end"; title: string };
};

/* Website pages that have a screen in the phone app. Anything else opens on the website. */
function screenFor(href: string): string | null {
  const url = new URL(href, "http://phone");
  const person = url.searchParams.get("individual");
  switch (url.pathname) {
    case "/app":
      return "/today";
    case "/app/clock":
    case "/app/clock/in":
    case "/app/clock/out":
      return "/clock";
    case "/app/daily-logs/new":
      return person ? `/note?person=${person}` : "/notes";
    case "/app/daily-logs":
      return "/notes";
    case "/app/incidents/new":
      return person ? `/report?person=${person}` : "/report";
    case "/app/medications":
      return "/meds";
    case "/app/tasks":
      return "/tasks";
    case "/app/my-documents":
      return "/documents";
    default:
      return null;
  }
}

/*
 * The website's answer, shaped for the phone. Links point to the app's screens where it has one.
 * A clock-in becomes a button to the phone's clock screen, which shows the handover and checks
 * the location and the statements, the same as the website's clock-in page.
 */
export function forPhone(reply: AssistantReply): PhoneReply {
  const links: PhoneLink[] = [];
  const seen = new Set<string>();
  const add = (link: PhoneLink) => {
    const key = link.screen ?? link.web ?? "";
    if (seen.has(key)) return;
    seen.add(key);
    links.push(link);
  };
  const { confirm, links: webLinks, ...rest } = reply;
  for (const link of webLinks ?? []) {
    const screen = screenFor(link.href);
    add(screen ? { label: link.label, screen } : { label: link.label, web: link.href });
  }
  const phoneConfirm: PhoneReply["confirm"] = confirm?.action === "clock_in" ? { action: "clock_in", title: confirm.title, detail: confirm.detail } : confirm;
  return { ...rest, links, ...(phoneConfirm ? { confirm: phoneConfirm } : {}) };
}
