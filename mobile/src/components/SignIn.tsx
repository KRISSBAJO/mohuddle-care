import { useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View, type TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL, ApiError } from "@/lib/api";
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
  const insets = useSafeAreaInsets();

  async function resetPassword() {
    try {
      await Linking.openURL(`${API_URL}/forgot-password`);
    } catch {
      setError("Could not open password reset. Visit the Mohuddle website or ask your office.");
    }
  }

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
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.brand }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.ground }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
          <View style={styles.hero}>
            <View style={styles.heroContent}>
              <BrandMark size={48} />
              <T weight="heavy" size={28} color="#ffffff" style={{ marginTop: 12, letterSpacing: -0.8 }}>
                {choices ? "Which agency?" : "Welcome back"}
              </T>
              <T size={15} color={colors.onBrandSoft} style={{ marginTop: 6 }}>
                {choices ? "You work for more than one. You can switch later in More." : "Sign in to Mohuddle"}
              </T>
            </View>
          </View>
          <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 24) }]}>
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
              <View style={{ gap: 14 }}>
                <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
                <Field ref={passwordRef} label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => submit()} />
                <Pressable accessibilityRole="link" onPress={resetPassword} style={({ pressed }) => [styles.reset, pressed && { opacity: 0.7 }]}>
                  <T weight="semibold" size={14} color={colors.brand} style={{ textDecorationLine: "underline" }}>Forgot password?</T>
                </Pressable>
                <ErrorText>{error || notice}</ErrorText>
                <Button label="Sign in" busy={busy === "form"} onPress={() => submit()} />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroContent: { width: "100%", maxWidth: 432, alignSelf: "center" },
  body: { width: "100%", maxWidth: 480, alignSelf: "center", padding: 24 },
  reset: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", paddingHorizontal: 4, marginTop: -8, marginBottom: -4 },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 14 },
  choiceMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
