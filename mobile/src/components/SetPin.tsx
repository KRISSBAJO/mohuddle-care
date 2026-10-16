import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { PinPad } from "./PinPad";
import { Button, Icon, T } from "./ui";

type Step = "enter" | "confirm" | "biometrics";

/* Choosing the app PIN after signing in, then whether to use fingerprint or face as well. */
export function SetPin() {
  const { rules, canOfferBiometrics, choosePin, hasPin, signOut } = useSession();
  const [length, setLength] = useState(rules.pinLength === "4" ? 4 : 6);
  const [step, setStep] = useState<Step>("enter");
  const [first, setFirst] = useState("");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [wrong, setWrong] = useState(false);

  async function typed(next: string) {
    setValue(next);
    setWrong(false);
    if (next.length < length) return;
    if (step === "enter") {
      if (/^(\d)\1+$/.test(next) || "0123456789".includes(next) || "9876543210".includes(next)) {
        setWrong(true);
        setMessage("That PIN is too easy to guess. Choose another.");
        setTimeout(() => setValue(""), 400);
        return;
      }
      setFirst(next);
      setValue("");
      setMessage("");
      setStep("confirm");
    } else if (next === first) {
      if (canOfferBiometrics) setStep("biometrics");
      else await choosePin(next, false);
    } else {
      setWrong(true);
      setMessage("Those PINs did not match. Start again.");
      setTimeout(() => {
        setValue("");
        setFirst("");
        setStep("enter");
      }, 500);
    }
  }

  if (step === "biometrics")
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.center}>
          <View style={styles.badge}>
            <Icon name="smartphone" size={28} color={colors.brand} />
          </View>
          <T weight="heavy" size={24} color="#ffffff" style={{ textAlign: "center" }}>
            Unlock with your face or fingerprint?
          </T>
          <T size={15} color={colors.onBrandSoft} style={{ textAlign: "center", marginTop: 8, marginBottom: 28 }}>
            Quicker than typing your PIN. Your PIN still works whenever you need it.
          </T>
          <View style={{ alignSelf: "stretch", gap: 10 }}>
            <Button label="Yes, use it" tone="lime" onPress={() => choosePin(first, true)} />
            <Button label="Not now" tone="onBrand" onPress={() => choosePin(first, false)} />
          </View>
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.center}>
        <T weight="heavy" size={24} color="#ffffff" style={{ textAlign: "center" }}>
          {step === "enter" ? (hasPin ? "Choose a new PIN" : "Choose a PIN") : "Enter it again"}
        </T>
        <T size={15} color={wrong ? "#f19b8f" : colors.onBrandSoft} style={{ textAlign: "center", marginTop: 8, marginBottom: 20, minHeight: 40 }}>
          {message || (step === "enter" ? `${length} digits. You will use it to open Mohuddle on this phone.` : "To make sure it is right.")}
        </T>
        {rules.pinLength === "either" && step === "enter" && !value ? (
          <View style={styles.lengths}>
            {[6, 4].map(option => (
              <Pressable key={option} onPress={() => setLength(option)} style={[styles.length, length === option && { backgroundColor: colors.lime }]}>
                <T weight="semibold" size={13} color={length === option ? colors.brand : "#ffffff"}>
                  {option} digits
                </T>
              </Pressable>
            ))}
          </View>
        ) : null}
        <PinPad length={length} value={value} onChange={typed} shake={wrong} />
        <Button label="Sign out" tone="onBrand" onPress={() => signOut()} style={{ marginTop: 18 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.brand },
  center: { flex: 1, padding: 24, justifyContent: "center", alignItems: "center" },
  badge: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  lengths: { flexDirection: "row", gap: 8, marginBottom: 22, backgroundColor: "rgba(255,255,255,0.09)", padding: 4, borderRadius: 14 },
  length: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
});
