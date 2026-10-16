import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/*
 * Small values kept on the phone. On a phone they go in the system keychain or keystore, which is
 * encrypted. The browser preview, used only while building, falls back to localStorage.
 */
const web = Platform.OS === "web";

export async function readValue(key: string): Promise<string | null> {
  if (web) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function writeValue(key: string, value: string) {
  if (web) return globalThis.localStorage?.setItem(key, value);
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function removeValue(key: string) {
  if (web) return globalThis.localStorage?.removeItem(key);
  await SecureStore.deleteItemAsync(key);
}
