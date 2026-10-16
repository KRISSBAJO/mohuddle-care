import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, ErrorText, Icon, T } from "@/components/ui";
import { API_URL, ApiError } from "@/lib/api";
import { queuedDoses } from "@/lib/outbox";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

const ROLES: Record<string, string> = { admin: "Administrator", coordinator: "Coordinator", nurse: "Nurse", dsp: "Direct support professional" };

/* Who is signed in, switching agency, and signing out. */
export default function MoreScreen() {
  const { me, signOut, switchAgency, biometricsOn } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const others = me?.agencies.filter(agency => agency.agencyId !== me.agency?.id) ?? [];
  // Doses saved with no signal are sent with this login; signing out first would strand them.
  const [unsent, setUnsent] = useState(0);
  const [sure, setSure] = useState(false);
  useFocusEffect(
    useCallback(() => {
      queuedDoses(`${me?.user.email}|${me?.agency?.id}`).then(list => setUnsent(list.length));
    }, [me]),
  );

  async function switchTo(agencyId: string) {
    setBusy(agencyId);
    setError("");
    try {
      await switchAgency(agencyId);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.ground }} contentContainerStyle={{ paddingBottom: 32 }}>
      <StatusBar style="dark" />
      <SafeAreaView edges={["top"]} style={styles.hero}>
        <View style={styles.avatar}>
          <T weight="bold" size={20} color={colors.lime}>
            {(me?.user.name ?? "?")
              .split(" ")
              .map(part => part[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </T>
        </View>
        <T weight="heavy" size={30} style={{ marginTop: 16, letterSpacing: -1.2, lineHeight: 36 }}>
          {me?.user.name}
        </T>
        <T size={14} color={colors.mute}>
          {ROLES[me?.user.role ?? ""] ?? me?.user.role} at {me?.agency?.name}
        </T>
      </SafeAreaView>

      <View style={{ padding: 20, gap: 12, paddingBottom: 120 }}>
        <Card style={{ gap: 4 }}>
          <T size={13} color={colors.mute}>
            Signed in as
          </T>
          <T weight="medium">{me?.user.email}</T>
        </Card>

        {others.length ? (
          <Card style={{ gap: 10 }}>
            <T weight="semibold">Switch agency</T>
            {others.map(agency => (
              <Pressable key={agency.agencyId} onPress={() => switchTo(agency.agencyId)} disabled={Boolean(busy)} style={styles.agency}>
                <Icon name="repeat" size={16} color={colors.sage} />
                <T style={{ flex: 1 }}>{agency.name}</T>
                <Icon name={busy === agency.agencyId ? "loader" : "chevron-right"} color={colors.mute} />
              </Pressable>
            ))}
            <ErrorText>{error}</ErrorText>
          </Card>
        ) : null}

        <Card style={{ gap: 4 }}>
          <T weight="semibold">Keeping records private</T>
          <T size={13} color={colors.mute}>
            Mohuddle locks after {me?.rules.lockMinutes ?? 5} minutes away and opens with your PIN{biometricsOn ? ", face or fingerprint" : ""}. If you lose this phone, your office can sign it out from the website.
          </T>
        </Card>

        {unsent ? (
          <ErrorText>
            {unsent} {unsent === 1 ? "dose is" : "doses are"} saved on this phone and not sent yet. Stay signed in until you have a signal, or they will not reach the medication record.
          </ErrorText>
        ) : null}
        <Button label={unsent && !sure ? "Sign out anyway" : unsent ? "Tap again to sign out" : "Sign out"} tone="danger" icon="log-out" onPress={() => (unsent && !sure ? setSure(true) : signOut())} />
        <T size={12} color={colors.dim} style={{ textAlign: "center" }}>
          Mohuddle {Constants.expoConfig?.version} · {API_URL.replace(/^https?:\/\//, "")}
        </T>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  agency: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
