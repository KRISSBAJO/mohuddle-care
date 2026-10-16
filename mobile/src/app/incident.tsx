import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ScreenBar } from "@/components/ScreenBar";
import { Button, ErrorText, Icon, T } from "@/components/ui";
import { API_URL, ApiError, type TeamIncident } from "@/lib/api";
import { whenText } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, fonts, shadow } from "@/lib/theme";

const SEVERITY: Record<string, { fg: string; bg: string }> = {
  low: { fg: colors.sage, bg: colors.sageSoft },
  moderate: { fg: colors.amber, bg: colors.amberSoft },
  high: { fg: colors.flag, bg: colors.flagSoft },
  critical: { fg: "#ffffff", bg: colors.flag },
};

/*
 * One incident for a manager on the phone: what happened, the state reporting deadline, photos and
 * the timeline. They can start the review and add follow-up notes; closing and filing with the state
 * stay on the website, where the full Reportable Event Form is.
 */
export default function IncidentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { call, me, token } = useSession();
  const zone = me?.agency?.zone;
  const [incident, setIncident] = useState<TeamIncident | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "review" | "note">("");
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      call<TeamIncident>(`/team/incidents/${id}`).then(setIncident, problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.")),
    [call, id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function send(body: { action: "review" } | { action: "note"; body: string }) {
    setBusy(body.action);
    setError("");
    try {
      await call(`/team/incidents/${id}`, body);
      if (body.action === "note") setNote("");
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  if (!incident)
    return (
      <View style={styles.page}>
        <ScreenBar title="Incident" />
        <View style={{ padding: 20 }}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.brand} />}</View>
      </View>
    );

  const severity = SEVERITY[incident.severity] ?? SEVERITY.moderate;
  const overdue = incident.overdue;
  return (
    <View style={styles.page}>
      <ScreenBar title="Incident" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, shadow.soft]}>
            <View style={styles.tags}>
              <View style={[styles.tag, { backgroundColor: severity.bg }]}>
                <T size={12} weight="semibold" color={severity.fg}>
                  {incident.severityLabel}
                </T>
              </View>
              <View style={styles.tag}>
                <T size={12} weight="semibold" color={colors.mute}>
                  {incident.statusLabel}
                </T>
              </View>
              {incident.reportable ? (
                <View style={styles.tag}>
                  <T size={12} weight="semibold" color={colors.mute}>
                    Reportable
                  </T>
                </View>
              ) : null}
            </View>
            <T weight="bold" size={20} style={{ letterSpacing: -0.4 }}>
              {incident.category}
            </T>
            <T size={14} color={colors.mute}>
              {[incident.person, incident.home].filter(Boolean).join(" · ") || "No person or home recorded"}
            </T>
            <T size={14} color={colors.mute}>
              {whenText(incident.occurredAt, zone)}
              {incident.reporter ? ` · reported by ${incident.reporter}` : ""}
            </T>
          </View>

          {incident.deadline ? (
            <View style={[styles.banner, { backgroundColor: overdue ? colors.flagSoft : colors.amberSoft }]}>
              <Icon name="clock" size={16} color={overdue ? colors.flag : colors.amber} />
              <T size={14} weight="semibold" color={overdue ? colors.flag : colors.amber} style={{ flex: 1 }}>
                {overdue ? `The state report was due ${whenText(incident.deadline, zone)}. File it on the website.` : `Report to the state by ${whenText(incident.deadline, zone)}. File it on the website.`}
              </T>
            </View>
          ) : null}

          <View style={[styles.card, shadow.soft]}>
            <T weight="bold" size={15}>
              What happened
            </T>
            <T style={{ lineHeight: 22 }}>{incident.description}</T>
            {incident.actionsTaken ? (
              <>
                <T weight="bold" size={15} style={{ marginTop: 8 }}>
                  What was done
                </T>
                <T style={{ lineHeight: 22 }}>{incident.actionsTaken}</T>
              </>
            ) : null}
          </View>

          {incident.photos.length ? (
            <View style={[styles.card, shadow.soft]}>
              <T weight="bold" size={15}>
                Photos
              </T>
              <View style={styles.photos}>
                {incident.photos.map(photo => (
                  <Photo key={photo.id} id={photo.id} token={token} label={photo.caption || `Photo by ${photo.by ?? "staff"}`} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={[styles.card, shadow.soft]}>
            <T weight="bold" size={15}>
              Timeline
            </T>
            {incident.timeline.map(entry => (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.entryDot} />
                <View style={{ flex: 1 }}>
                  <T size={14} style={{ lineHeight: 20 }}>
                    {entry.body}
                  </T>
                  <T size={12} color={colors.dim}>
                    {[entry.by, whenText(entry.at, zone)].filter(Boolean).join(" · ")}
                  </T>
                </View>
              </View>
            ))}
            <TextInput value={note} onChangeText={setNote} placeholder="Add a follow-up note" placeholderTextColor={colors.dim} maxLength={3000} multiline style={styles.note} accessibilityLabel="Follow-up note" />
            <Button label="Add note" tone="ghost" icon="message-square" busy={busy === "note"} disabled={Boolean(busy) || note.trim().length < 3} onPress={() => send({ action: "note", body: note })} />
          </View>

          <ErrorText>{error}</ErrorText>
          {incident.status === "open" ? <Button label="Start the review" icon="play" busy={busy === "review"} disabled={Boolean(busy)} onPress={() => send({ action: "review" })} style={{ minHeight: 54, borderRadius: 18 }} /> : null}
          <T size={13} color={colors.mute} style={{ textAlign: "center" }}>
            Changing the details, filing with the state and closing are done on the website.
          </T>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* A photo that needs the phone's sign-in to load. On a phone the image request carries it; the browser preview fetches it first. */
function Photo({ id, token, label }: { id: string; token: string | null; label: string }) {
  const url = `${API_URL}/api/v1/incidents/photos/${id}`;
  const [webUri, setWebUri] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !token) return;
    let made = "";
    fetch(url, { headers: { authorization: `Bearer ${token}` } })
      .then(response => (response.ok ? response.blob() : null))
      .then(blob => {
        if (!blob) return;
        made = URL.createObjectURL(blob);
        setWebUri(made);
      })
      .catch(() => undefined);
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [url, token]);
  const source = Platform.OS === "web" ? (webUri ? { uri: webUri } : null) : { uri: url, headers: { authorization: `Bearer ${token ?? ""}` } };
  return <View style={styles.photo}>{source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={label} /> : <ActivityIndicator color={colors.brand} />}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  scroll: { padding: 20, paddingTop: 8, gap: 12, paddingBottom: 48 },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 6 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  tag: { backgroundColor: "#eceee8", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, padding: 14 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  photo: { width: 96, height: 96, borderRadius: 14, overflow: "hidden", backgroundColor: "#eceee8", alignItems: "center", justifyContent: "center" },
  entry: { flexDirection: "row", gap: 10, paddingVertical: 6 },
  entryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sage, marginTop: 6 },
  note: { minHeight: 64, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, backgroundColor: "#fbfcf9", marginTop: 8, textAlignVertical: "top" },
});
