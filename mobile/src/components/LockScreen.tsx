import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@/lib/api";
import { pinLength } from "@/lib/pin";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { PinPad } from "./PinPad";
import { Button, ErrorText, Field, Icon, T } from "./ui";

/*
 * Shown after the app has been away: nothing else is visible until the person proves it is them,
 * with their PIN, their fingerprint or face, or their password.
 */
export function LockScreen() {
  const { hasPin, biometricsOn, unlockWithPin, unlockWithBiometrics, unlockWithPassword, signOut, email, me } = useSession();
  const [mode, setMode] = useState<"pin" | "password">(hasPin ? "pin" : "password");
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pinSize, setPinSize] = useState(6);

  // The dots match the saved PIN's length.
  useEffect(() => {
    pinLength().then(length => length && setPinSize(length));
  }, []);

  // Ask for a face or fingerprint straight away when they chose it.
  useEffect(() => {
    if (!biometricsOn) return;
    unlockWithBiometrics().catch(() => setError("Something went wrong. Use your PIN."));
  }, [biometricsOn, unlockWithBiometrics]);

  async function typed(next: string) {
    setPin(next);
    setWrong(false);
    setError("");
    if (next.length < pinSize) return;
    const result = await unlockWithPin(next);
    if (result.ok || "signedOut" in result) return;
    setWrong(true);
    setError(result.triesLeft === 1 ? "Wrong PIN. One more wrong try signs you out." : `Wrong PIN. ${result.triesLeft} tries left.`);
    setTimeout(() => setPin(""), 450);
  }

  async function submitPassword() {
    if (!password) return setError("Enter your password.");
    setBusy(true);
    setError("");
    try {
      await unlockWithPassword(password);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const first = me?.user.name.split(" ")[0];
  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.inner}>
        <View style={styles.lock}>
          <Icon name="lock" size={24} color={colors.brand} />
        </View>
        <T weight="heavy" size={24} color="#ffffff" style={{ textAlign: "center" }}>
          {first ? `Welcome back, ${first}` : "Mohuddle is locked"}
        </T>
        <T size={14} color={wrong ? "#f19b8f" : colors.onBrandSoft} style={{ textAlign: "center", marginTop: 6, marginBottom: 22, minHeight: 20 }}>
          {mode === "pin" ? error || "Enter your PIN" : `Enter the password for ${email ?? "your login"}.`}
        </T>

        {mode === "pin" ? (
          <PinPad length={pinSize} value={pin} onChange={typed} shake={wrong} side={biometricsOn ? { icon: "smartphone", label: "Unlock with face or fingerprint", onPress: () => void unlockWithBiometrics() } : undefined} />
        ) : (
          <View style={{ gap: 14, alignSelf: "stretch" }}>
            <View style={styles.fieldWrap}>
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" returnKeyType="go" onSubmitEditing={submitPassword} />
            </View>
            <Button label="Unlock" tone="lime" icon="unlock" busy={busy} onPress={submitPassword} />
            <View style={{ alignSelf: "stretch" }}>
              <ErrorText>{error}</ErrorText>
            </View>
          </View>
        )}

        <View style={styles.links}>
          {hasPin ? (
            <Button
              label={mode === "pin" ? "Forgot PIN? Use password" : "Use PIN instead"}
              tone="onBrand"
              onPress={() => {
                setMode(mode === "pin" ? "password" : "pin");
                setError("");
                setWrong(false);
              }}
            />
          ) : null}
          <Button label="Sign out" tone="onBrand" onPress={() => signOut()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.brand },
  inner: { flex: 1, padding: 24, justifyContent: "center", alignItems: "center" },
  lock: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  fieldWrap: { backgroundColor: colors.ground, borderRadius: 16, padding: 14 },
  links: { marginTop: 18, alignItems: "center" },
});
