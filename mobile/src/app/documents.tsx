import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScreenBar } from "@/components/ScreenBar";
import { ErrorText, Icon, T } from "@/components/ui";
import { API_URL, ApiError, type MyDocuments } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

type Item = MyDocuments["requests"][number]["items"][number];
const STATUS: Record<Item["status"], { words: string; bg: string; fg: string }> = {
  pending: { words: "To do", bg: "#fdf0dc", fg: "#9a6212" },
  rejected: { words: "Send again", bg: colors.flagSoft, fg: colors.flag },
  submitted: { words: "Sent, being checked", bg: colors.sky, fg: colors.skyInk },
  approved: { words: "Done", bg: colors.sageSoft, fg: colors.sage },
};

/*
 * What the agency has asked you for: photograph or pick a file to send, or open a document to sign.
 * Like the website, it shows the state of your file, never the files themselves.
 */
export default function DocumentsScreen() {
  const { call, me, token } = useSession();
  const zone = me?.agency?.zone;
  const [data, setData] = useState<MyDocuments | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const load = useCallback(() => call<MyDocuments>("/documents").then(setData, problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.")), [call]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function upload(item: Item, from: "camera" | "file") {
    setError("");
    setSent("");
    let file: { uri: string; name: string; type: string } | null = null;
    if (from === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return setError("Mohuddle needs the camera to photograph a document. Allow it in your phone's settings.");
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      file = { uri: asset.uri, name: asset.fileName ?? `${item.label}.jpg`, type: asset.mimeType ?? "image/jpeg" };
    } else {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      file = { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" };
    }
    setBusy(item.id);
    try {
      const form = new FormData();
      form.append("itemId", item.id);
      // In a browser the file is a blob; on a phone, React Native sends it from its address.
      if (Platform.OS === "web") form.append("file", new File([await (await fetch(file.uri)).blob()], file.name, { type: file.type }));
      else form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      const response = await fetch(`${API_URL}/api/v1/documents/upload`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new ApiError(response.status, "refused", result.error ?? "The file could not be sent. Try again.");
      setSent(`${item.label} sent. Your coordinator has been told.`);
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "No connection. Check your signal and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScreenBar title="My documents" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 14, paddingBottom: 48 }}>
        <ErrorText>{error}</ErrorText>
        {sent ? (
          <View style={[styles.callout, { backgroundColor: colors.sageSoft }]}>
            <T size={13} weight="semibold" color={colors.sage}>
              {sent}
            </T>
          </View>
        ) : null}
        {data && !data.requests.length ? (
          <View style={[styles.card, { alignItems: "center", padding: 24 }, shadow.soft]}>
            <Icon name="check-circle" size={22} color={colors.sage} />
            <T weight="semibold" style={{ marginTop: 8 }}>
              You are all caught up
            </T>
            <T size={13} color={colors.mute}>
              Nothing is waiting for you.
            </T>
          </View>
        ) : null}

        {data?.requests.map(request => (
          <View key={request.id} style={{ gap: 8 }}>
            <View>
              <T weight="bold" size={17}>
                {request.title}
              </T>
              <T size={13} color={colors.mute}>
                Sent {fmt.dayShort(request.sentAt, zone)}
                {request.dueOn ? ` · needed by ${fmt.dayShort(`${request.dueOn}T12:00:00Z`, "UTC")}` : ""}
              </T>
              {request.message ? (
                <T size={13} color={colors.mute}>
                  “{request.message}”
                </T>
              ) : null}
            </View>
            <View style={[styles.card, shadow.soft]}>
              {request.items.map((item, index) => {
                const look = STATUS[item.status];
                const open = item.status === "pending" || item.status === "rejected";
                return (
                  <Fragment key={item.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.item}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Icon name={item.kind === "sign" ? "edit-2" : "upload"} size={17} color={colors.sage} />
                        <T weight="semibold" style={{ flex: 1 }}>
                          {item.label}
                        </T>
                        <View style={[styles.chip, { backgroundColor: look.bg }]}>
                          <T size={12} weight="semibold" color={look.fg}>
                            {look.words}
                          </T>
                        </View>
                      </View>
                      {item.status === "rejected" && item.reviewNote ? (
                        <T size={13} color={colors.flag}>
                          {item.reviewNote}
                        </T>
                      ) : null}
                      {open && item.kind === "sign" ? (
                        <Pressable accessibilityRole="button" onPress={() => router.push(`/sign?item=${item.id}`)} style={[styles.action, styles.primary]}>
                          <T weight="semibold" color="#ffffff">
                            Read and sign
                          </T>
                        </Pressable>
                      ) : null}
                      {open && item.kind === "upload" ? (
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Pressable accessibilityRole="button" disabled={busy === item.id} onPress={() => upload(item, "camera")} style={[styles.action, styles.primary, { flex: 1 }]}>
                            <T weight="semibold" color="#ffffff">
                              {busy === item.id ? "Sending…" : "Take a photo"}
                            </T>
                          </Pressable>
                          <Pressable accessibilityRole="button" disabled={busy === item.id} onPress={() => upload(item, "file")} style={[styles.action, { flex: 1 }]}>
                            <T weight="semibold">Choose a file</T>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </Fragment>
                );
              })}
            </View>
          </View>
        ))}

        {data?.file.length ? (
          <>
            <T weight="bold" size={17} style={{ marginTop: 6 }}>
              My staff file
            </T>
            <View style={[styles.card, shadow.soft]}>
              {data.file.map((row, index) => (
                <Fragment key={row.name}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <View style={[styles.item, { flexDirection: "row", alignItems: "center" }]}>
                    <T style={{ flex: 1 }}>{row.name}</T>
                    <T size={12} weight="semibold" color={row.tone === "bad" ? colors.flag : row.tone === "warn" ? "#9a6212" : row.tone === "good" ? colors.sage : colors.mute}>
                      {row.state}
                    </T>
                  </View>
                </Fragment>
              ))}
            </View>
            <T size={12} color={colors.mute}>
              For your privacy the files stay with the office and are not shown here.
            </T>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 22, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginHorizontal: 16 },
  item: { padding: 16, gap: 10 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  action: { minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  primary: { backgroundColor: colors.brand, borderColor: colors.brand },
  callout: { borderRadius: 12, padding: 10 },
});
