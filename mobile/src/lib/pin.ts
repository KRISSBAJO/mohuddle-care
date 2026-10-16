import * as Crypto from "expo-crypto";
import { readValue, removeValue, writeValue } from "./storage";

/*
 * The app PIN. It is checked on the phone, so it works with no signal. Only a salted hash is kept,
 * in secure storage, and too many wrong tries sign the app out (see session.tsx).
 */

const KEYS = { pin: "mohuddle.pin", fails: "mohuddle.pinFails" };
type Stored = { salt: string; hash: string; length: number };

const digest = (salt: string, pin: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

export async function savePin(pin: string) {
  const salt = Array.from(Crypto.getRandomBytes(16), byte => byte.toString(16).padStart(2, "0")).join("");
  const stored: Stored = { salt, hash: await digest(salt, pin), length: pin.length };
  await writeValue(KEYS.pin, JSON.stringify(stored));
  await removeValue(KEYS.fails);
}

/* The saved PIN's length, or null when there is none. */
export async function pinLength(): Promise<number | null> {
  const raw = await readValue(KEYS.pin);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as Stored).length;
  } catch {
    return null;
  }
}

/* Checks a PIN. Returns how many wrong tries there have been in a row (0 when right). */
export async function checkPin(pin: string): Promise<number> {
  const raw = await readValue(KEYS.pin);
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const stored = JSON.parse(raw) as Stored;
  if ((await digest(stored.salt, pin)) === stored.hash) {
    await removeValue(KEYS.fails);
    return 0;
  }
  const fails = Number((await readValue(KEYS.fails)) ?? 0) + 1;
  await writeValue(KEYS.fails, String(fails));
  return fails;
}

export async function forgetPin() {
  await Promise.all([removeValue(KEYS.pin), removeValue(KEYS.fails)]);
}

/* Whether a saved PIN still meets the agency's rule. */
export const pinFits = (length: number | null, rule: "6" | "4" | "either") => length !== null && (rule === "either" ? length === 4 || length === 6 : length === Number(rule));
