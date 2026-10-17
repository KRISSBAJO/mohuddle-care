import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@/lib/api";
import { useSession, type AgencyChoice } from "@/lib/session";
import { colors } from "@/lib/theme";
import { Button, ErrorText, Field, Icon, T } from "./ui";
import { BrandMark } from "./BrandMark";

/* Email and password; then, for someone at several agencies, which one. */
export function SignIn() {
  const { signIn, email: savedEmail, notice } = useSession();
  const [email, setEmail] = useState(savedEmail ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<AgencyChoice[] | null>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit(agencyId?: string) {
    if (!email.trim() || !password) return setError("Enter your email address and password.");
    setError("");
    setBusy(agencyId ?? "form");
    try {
      const result = await signIn(email, password, agencyId);
      if ("choose" in result) setChoices(result.choose);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <SafeAreaView edges={["top"]} style={styles.hero}>
        <BrandMark size={64} />
        <T weight="heavy" size={30} color="#ffffff" style={{ marginTop: 18, letterSpacing: -1 }}>
          {choices ? "Which agency?" : "Welcome to Mohuddle"}
        </T>
        <T size={15} color={colors.onBrandSoft} style={{ marginTop: 6 }}>
          {choices ? "You work for more than one. You can switch later in More." : "Sign in with the email and password your office set up for you."}
        </T>
      </SafeAreaView>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {choices ? (
            <View style={{ gap: 10 }}>
              {choices.map(choice => (
                <Pressable key={choice.agencyId} onPress={() => submit(choice.agencyId)} disabled={Boolean(busy)} style={({ pressed }) => [styles.choice, pressed && { opacity: 0.85 }]}>
                  <View style={styles.choiceMark}>
                    <T weight="bold" color={colors.lime}>
                      {choice.name.slice(0, 1).toUpperCase()}
                    </T>
                  </View>
                  <T weight="semibold" size={16} style={{ flex: 1 }}>
                    {choice.name}
                  </T>
                  <Icon name={busy === choice.agencyId ? "loader" : "chevron-right"} color={colors.mute} />
                </Pressable>
              ))}
              <ErrorText>{error}</ErrorText>
              <Button label="Back" tone="ghost" onPress={() => setChoices(null)} />
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
              <Field ref={passwordRef} label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => submit()} />
              <ErrorText>{error || notice}</ErrorText>
              <Button label="Sign in" busy={busy === "form"} onPress={() => submit()} />
              <T size={13} color={colors.mute} style={{ textAlign: "center" }}>
                Forgot your password? Ask your office, or reset it on the Mohuddle website.
              </T>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, paddingHorizontal: 24, paddingBottom: 28, paddingTop: 36, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  body: { padding: 24, paddingTop: 28 },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 14 },
  choiceMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
