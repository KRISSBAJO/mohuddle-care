/*
 * What a phone notification says, by the agency's phone_push_detail setting. Phone notifications pass
 * through Expo, Apple and Google and show on a locked screen, so the default says nothing about anyone.
 */
export type PushDetail = "private" | "title" | "full";

export const PRIVATE_ALERT = "You have a new alert. Open Mohuddle to see it.";

export function pushWords(detail: PushDetail, message: { title: string; body?: string }): { title: string; body?: string } {
  if (detail === "full") return { title: message.title, body: message.body || undefined };
  if (detail === "title") return { title: message.title };
  return { title: "Mohuddle", body: PRIVATE_ALERT };
}
