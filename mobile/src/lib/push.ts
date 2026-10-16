import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/*
 * Phone notifications. The phone asks once for permission; after that, each start sends the phone's
 * Expo push address to the server, which keeps it on this sign-in only. What a notification shows
 * on the lock screen is the agency's setting; the full alert is always in the app's Alerts list.
 */

export type PushState = "on" | "off" | "denied" | "unsupported";

// Only a real phone gets notifications; the browser preview and simulators cannot.
const supported = Platform.OS !== "web" && Device.isDevice;

if (supported) {
  // An alert that arrives while the app is open still shows as a banner.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
}

export async function pushState(): Promise<PushState> {
  if (!supported) return "unsupported";
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "on" : status === "denied" ? "denied" : "off";
}

/* Asks for permission when `ask` is true, then tells the server where to send. Without permission nothing is sent. */
export async function enablePush(call: <R>(path: string, body?: unknown) => Promise<R>, ask: boolean): Promise<PushState> {
  if (!supported) return "unsupported";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("alerts", { name: "Alerts", importance: Notifications.AndroidImportance.HIGH, lightColor: "#173e35" });
  }
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && ask && canAskAgain) ({ status, canAskAgain } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return status === "denied" || !canAskAgain ? "denied" : "off";
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await call("/push", { token: data });
  return "on";
}

/* Stops notifications to this phone, for this sign-in. */
export async function disablePush(call: <R>(path: string, body?: unknown) => Promise<R>) {
  await call("/push", { token: null });
}

export const pushSupported = supported;
