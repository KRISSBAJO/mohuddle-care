import { router } from "expo-router";

/* Back to the screen before, or to Today when this screen was opened on its own (a link or a reload). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/today");
}
