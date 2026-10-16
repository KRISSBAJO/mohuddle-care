import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { enablePush } from "@/lib/push";
import { useSession } from "@/lib/session";
import { readValue, writeValue } from "@/lib/storage";

export const PUSH_OFF_KEY = "mohuddle.pushOff";
const PUSH_ASKED_KEY = "mohuddle.pushAsked";

/*
 * Runs while someone is signed in on a real phone. The first time, the phone asks whether Mohuddle
 * may send notifications. After that it refreshes the phone's push address with the server, unless
 * notifications were turned off in More, and opens the right screen when a notification is tapped.
 * Behind the lock, the screen is there once unlocked.
 */
export function PushListener() {
  const { call, me } = useSession();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!me) return;
    // The phone asks for permission once, after the first sign-in; later it is changed in More.
    Promise.all([readValue(PUSH_OFF_KEY), readValue(PUSH_ASKED_KEY)]).then(
      ([off, asked]) => {
        if (off === "1") return;
        enablePush(call, asked !== "1")
          .then(() => writeValue(PUSH_ASKED_KEY, "1"))
          .catch(() => undefined);
      },
      () => undefined,
    );
    // Again after switching agency: that is a new sign-in on the server.
  }, [call, me]);

  useEffect(() => {
    const id = response?.notification.request.identifier;
    if (!response || !id || handled.current === id) return;
    handled.current = id;
    const data = response.notification.request.content.data as { screen?: string; notificationId?: string };
    if (data.notificationId) call("/notifications/read", { id: data.notificationId }).catch(() => undefined);
    router.push((data.screen || "/alerts") as never);
  }, [response, call]);

  return null;
}
