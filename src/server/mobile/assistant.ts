import "server-only";
import type { AssistantReply } from "@/lib/assistant";
import { phoneScreenFor } from "@/lib/phone-screens";

/* A link in a phone answer: a screen in the app, or a page that only the website has. */
export type PhoneLink = { label: string; screen?: string; web?: string };
export type PhoneReply = Omit<AssistantReply, "links" | "confirm"> & {
  links: PhoneLink[];
  confirm?: { action: "clock_in"; title: string; detail: string } | { action: "break_start"; options: { kind: "meal" | "rest"; label: string }[] } | { action: "break_end"; title: string };
};

/*
 * The website's answer, shaped for the phone. Links point to the app's screens where it has one.
 * A clock-in becomes a button to the phone's clock screen, which shows the handover and checks
 * the location and the statements, the same as the website's clock-in page.
 */
export function forPhone(reply: AssistantReply, manager: boolean): PhoneReply {
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
    const screen = phoneScreenFor(link.href, manager);
    add(screen ? { label: link.label, screen } : { label: link.label, web: link.href });
  }
  const phoneConfirm: PhoneReply["confirm"] = confirm?.action === "clock_in" ? { action: "clock_in", title: confirm.title, detail: confirm.detail } : confirm;
  return { ...rest, links, ...(phoneConfirm ? { confirm: phoneConfirm } : {}) };
}
