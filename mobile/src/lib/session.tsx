import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { api, ApiError, type Me, type Rules } from "./api";
import { checkPin, forgetPin, pinFits, pinLength, savePin } from "./pin";
import { readValue, removeValue, writeValue } from "./storage";

/*
 * The signed-in person on this phone. The token lives in secure storage. After the first sign-in
 * they choose a PIN. The app locks when it has been away longer than the agency's lock time, and on
 * a cold start after that long; it unlocks with the PIN, the phone's fingerprint or face (when the
 * agency allows it and they turned it on), or the password.
 */

type Status = "loading" | "signed_out" | "locked" | "set_pin" | "ready";
export type AgencyChoice = { agencyId: string; name: string };
type SignInResult = { choose: AgencyChoice[] } | { ok: true };
export type PinResult = { ok: true } | { ok: false; triesLeft: number } | { ok: false; signedOut: true };

type Session = {
  status: Status;
  /* For uploads that cannot go through call(), such as a recording. */
  token: string | null;
  me: Me | null;
  email: string | null;
  rules: Rules;
  /* A message for the sign-in screen, such as why the app signed out. */
  notice: string;
  hasPin: boolean;
  /* The phone can check a fingerprint or face, and the agency allows it. */
  canOfferBiometrics: boolean;
  /* ...and this person turned it on. */
  biometricsOn: boolean;
  signIn: (email: string, password: string, agencyId?: string) => Promise<SignInResult>;
  choosePin: (pin: string, useBiometrics: boolean) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<PinResult>;
  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPassword: (password: string) => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  switchAgency: (agencyId: string) => Promise<void>;
  /* Calls the phone API with this session's token; signs out when the server says the session ended. */
  call: <T>(path: string, body?: unknown) => Promise<T>;
};

const KEYS = { token: "mohuddle.token", email: "mohuddle.email", agency: "mohuddle.agency", away: "mohuddle.awaySince", rules: "mohuddle.rules", biometrics: "mohuddle.biometrics" };
const DEFAULT_RULES: Rules = { lockMinutes: 5, pinLength: "6", biometrics: true, pinAttempts: 5 };

const SessionContext = createContext<Session | null>(null);

const deviceName = () => (Platform.OS === "web" ? "Browser preview" : Device.deviceName || Device.modelName || "Phone");
const offline = (error: unknown) => error instanceof ApiError && error.code === "offline";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [notice, setNotice] = useState("");
  const [savedPinLength, setSavedPinLength] = useState<number | null>(null);
  const [hardware, setHardware] = useState(false);
  const [biometricsChosen, setBiometricsChosen] = useState(false);
  const rulesRef = useRef(DEFAULT_RULES);

  const applyRules = useCallback(async (next: Rules) => {
    rulesRef.current = next;
    setRules(next);
    await writeValue(KEYS.rules, JSON.stringify(next));
  }, []);

  const clear = useCallback(async (message = "") => {
    await Promise.all([removeValue(KEYS.token), removeValue(KEYS.away), removeValue(KEYS.biometrics), forgetPin()]);
    setToken(null);
    setMe(null);
    setSavedPinLength(null);
    setBiometricsChosen(false);
    setNotice(message);
    setStatus("signed_out");
  }, []);

  const loadMe = useCallback(
    async (useToken: string) => {
      try {
        const data = await api<Me>("/me", { token: useToken });
        setMe(data);
        await applyRules(data.rules);
        if (data.agency) await writeValue(KEYS.agency, data.agency.id);
        return data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await clear("You were signed out. Sign in again.");
        throw error;
      }
    },
    [applyRules, clear],
  );

  // Open, or ask for a PIN first when there is none or it no longer meets the agency's rule.
  const openUp = useCallback(async () => {
    const length = await pinLength();
    setSavedPinLength(length);
    setStatus(pinFits(length, rulesRef.current.pinLength) ? "ready" : "set_pin");
  }, []);

  // On start: a saved token opens straight away if the app was away less than the lock time.
  useEffect(() => {
    (async () => {
      const [savedToken, savedEmail, away, savedRules, chosen, length] = await Promise.all([
        readValue(KEYS.token),
        readValue(KEYS.email),
        readValue(KEYS.away),
        readValue(KEYS.rules),
        readValue(KEYS.biometrics),
        pinLength(),
      ]);
      setEmail(savedEmail);
      setSavedPinLength(length);
      setBiometricsChosen(chosen === "on");
      if (savedRules) {
        rulesRef.current = { ...DEFAULT_RULES, ...(JSON.parse(savedRules) as Partial<Rules>) };
        setRules(rulesRef.current);
      }
      if (Platform.OS !== "web") {
        const [hasHardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
        setHardware(hasHardware && enrolled);
      }
      if (!savedToken) return setStatus("signed_out");
      setToken(savedToken);
      const awayFor = away ? Date.now() - Number(away) : Infinity;
      if (awayFor > rulesRef.current.lockMinutes * 60_000) return setStatus("locked");
      try {
        await loadMe(savedToken);
        await openUp();
      } catch (error) {
        // No signal: still open, so drafts and the clock can work; the screens say they are offline.
        if (offline(error)) await openUp();
      }
    })();
  }, [loadMe, openUp]);

  // Locks after being away. "Away" starts when the app leaves the screen.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async next => {
      if (next === "active") {
        const away = Number((await readValue(KEYS.away)) ?? 0);
        if (away && Date.now() - away > rulesRef.current.lockMinutes * 60_000) setStatus(current => (current === "ready" ? "locked" : current));
        await removeValue(KEYS.away);
      } else {
        await writeValue(KEYS.away, String(Date.now()));
      }
    });
    return () => subscription.remove();
  }, []);

  const start = useCallback(
    async (newToken: string) => {
      await writeValue(KEYS.token, newToken);
      setToken(newToken);
      setNotice("");
      await loadMe(newToken);
      await openUp();
    },
    [loadMe, openUp],
  );

  const signIn = useCallback(
    async (address: string, password: string, agencyId?: string): Promise<SignInResult> => {
      const result = await api<{ token?: string; choose?: AgencyChoice[] }>("/auth/sign-in", { body: { email: address.trim(), password, agencyId, device: deviceName() } });
      if (result.choose) return { choose: result.choose };
      // Someone else signing in on this phone does not inherit the last person's PIN.
      if (email && email.toLowerCase() !== address.trim().toLowerCase()) await Promise.all([forgetPin(), removeValue(KEYS.biometrics)]);
      await writeValue(KEYS.email, address.trim());
      setEmail(address.trim());
      await start(result.token!);
      return { ok: true };
    },
    [email, start],
  );

  const choosePin = useCallback(async (pin: string, useBiometrics: boolean) => {
    await savePin(pin);
    await writeValue(KEYS.biometrics, useBiometrics ? "on" : "off");
    setSavedPinLength(pin.length);
    setBiometricsChosen(useBiometrics);
    setStatus("ready");
  }, []);

  // After unlocking: refresh who they are when there is signal; open either way.
  const afterUnlock = useCallback(async () => {
    if (token) {
      try {
        await loadMe(token);
      } catch (error) {
        if (!offline(error)) throw error;
      }
    }
    await openUp();
  }, [token, loadMe, openUp]);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<PinResult> => {
      const fails = await checkPin(pin);
      if (fails === 0) {
        await afterUnlock();
        return { ok: true };
      }
      if (fails >= rulesRef.current.pinAttempts) {
        if (token) await api("/auth/sign-out", { token, body: {} }).catch(() => undefined);
        await clear("Too many wrong PINs, so Mohuddle signed out. Sign in with your password.");
        return { ok: false, signedOut: true };
      }
      return { ok: false, triesLeft: rulesRef.current.pinAttempts - fails };
    },
    [afterUnlock, token, clear],
  );

  const unlockWithBiometrics = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Mohuddle", fallbackLabel: "Use PIN", disableDeviceFallback: true });
    if (!result.success) return false;
    await afterUnlock();
    return true;
  }, [afterUnlock]);

  // The password, checked by signing in again to the same agency. Also the way back from a forgotten PIN.
  const unlockWithPassword = useCallback(
    async (password: string) => {
      if (!email) throw new ApiError(400, "no_email", "Sign in again.");
      const agencyId = (await readValue(KEYS.agency)) ?? undefined;
      const old = token;
      const result = await api<{ token?: string }>("/auth/sign-in", { body: { email, password, agencyId, device: deviceName() } });
      if (!result.token) throw new ApiError(400, "choose", "Sign in again.");
      if (old) await api("/auth/sign-out", { token: old, body: {} }).catch(() => undefined);
      await start(result.token);
    },
    [email, token, start],
  );

  const signOut = useCallback(
    async (message?: string) => {
      if (token) await api("/auth/sign-out", { token, body: {} }).catch(() => undefined);
      await clear(message);
    },
    [token, clear],
  );

  const switchAgency = useCallback(
    async (agencyId: string) => {
      const result = await api<{ token: string }>("/auth/switch", { token, body: { agencyId } });
      await start(result.token);
    },
    [token, start],
  );

  const call = useCallback(
    async <T,>(path: string, body?: unknown) => {
      try {
        return await api<T>(path, { token, body });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await clear("You were signed out. Sign in again.");
        throw error;
      }
    },
    [token, clear],
  );

  const canOfferBiometrics = hardware && rules.biometrics;
  const value = useMemo(
    () => ({
      status,
      token,
      me,
      email,
      rules,
      notice,
      hasPin: savedPinLength !== null,
      canOfferBiometrics,
      biometricsOn: canOfferBiometrics && biometricsChosen,
      signIn,
      choosePin,
      unlockWithPin,
      unlockWithBiometrics,
      unlockWithPassword,
      signOut,
      switchAgency,
      call,
    }),
    [status, token, me, email, rules, notice, savedPinLength, canOfferBiometrics, biometricsChosen, signIn, choosePin, unlockWithPin, unlockWithBiometrics, unlockWithPassword, signOut, switchAgency, call],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider.");
  return session;
}
