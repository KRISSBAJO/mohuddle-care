import { router } from "expo-router";

/* Back to the screen before, or to Today (or the given screen) when this one was opened on its own (a link or a reload). */
export function goBack(fallback: "/today" | "/chat" = "/today") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
