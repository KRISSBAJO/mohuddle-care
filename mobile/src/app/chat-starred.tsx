import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { ScreenBar } from "@/components/ScreenBar";
import { ErrorText, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { previewOf } from "@/lib/chat";
import { whenText } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

type Starred = { id: string; chatId: string; body: string; kind: string; at: string; sender: string | null; chatTitle: string };

/* Messages you starred, newest first. Tap one to open it in its chat. */
export default function StarredScreen() {
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [rows, setRows] = useState<Starred[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    call<{ messages: Starred[] }>("/chat/starred").then(
      data => setRows(data.messages),
      problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
    );
  }, [call]);
  return (
    <View style={styles.page}>
      <ScreenBar title="Starred messages" />
      <View style={{ paddingHorizontal: 16 }}>
        <ErrorText>{error}</ErrorText>
      </View>
      {!rows && !error ? <ActivityIndicator color={colors.brand} style={{ marginTop: 30 }} /> : null}
      <FlatList
        data={rows ?? []}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
        ListEmptyComponent={
          rows ? (
            <T color={colors.mute} style={{ textAlign: "center", marginTop: 30 }}>
              Long press a message and choose Star to find it here.
            </T>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/conversation?id=${item.chatId}&m=${item.id}`)} style={({ pressed }) => [styles.card, shadow.soft, pressed && { opacity: 0.8 }]}>
            <View style={styles.between}>
              <T size={13} weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                {item.sender ?? "Former colleague"}
                {item.chatTitle ? ` · ${item.chatTitle}` : ""}
              </T>
              <T size={12} color={colors.dim}>
                {whenText(item.at, zone)}
              </T>
            </View>
            <T size={15} numberOfLines={3} style={{ marginTop: 4 }}>
              {previewOf(item.kind, item.body)}
            </T>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 14 },
  between: { flexDirection: "row", alignItems: "center", gap: 8 },
});
