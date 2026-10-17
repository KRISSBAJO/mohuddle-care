import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { ChatAvatar } from "@/components/ChatAvatar";
import { ScreenBar } from "@/components/ScreenBar";
import { ErrorText, Icon, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ROLE_NAMES, type Person } from "@/lib/chat";
import { useSession } from "@/lib/session";
import { colors, fonts } from "@/lib/theme";

/* Starting a chat: tap a person for a one-to-one chat, or switch to Group, name it and choose people. */
export default function NewChatScreen() {
  const { call } = useSession();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [mode, setMode] = useState<"person" | "group">("person");
  const [term, setTerm] = useState("");
  const [title, setTitle] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    call<{ people: Person[] }>("/chat/people").then(
      data => setPeople(data.people),
      problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
    );
  }, [call]);

  async function start(body: object) {
    setBusy(true);
    setError("");
    try {
      const result = await call<{ chatId: string }>("/chat/chats", body);
      router.replace(`/conversation?id=${result.chatId}`);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const list = (people ?? []).filter(person => person.name.toLowerCase().includes(term.trim().toLowerCase()));
  return (
    <View style={styles.page}>
      <ScreenBar title={mode === "person" ? "New chat" : "New group"} />
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <View style={styles.toggle}>
          {(["person", "group"] as const).map(value => (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} style={[styles.toggleItem, mode === value && styles.toggleOn]}>
              <T weight="semibold" size={14} color={mode === value ? colors.ink : colors.mute}>
                {value === "person" ? "One person" : "Group"}
              </T>
            </Pressable>
          ))}
        </View>
        {mode === "group" ? <TextInput value={title} onChangeText={setTitle} placeholder="Group name" placeholderTextColor={colors.dim} maxLength={80} style={styles.field} accessibilityLabel="Group name" /> : null}
        <View style={styles.search}>
          <Icon name="search" size={16} color={colors.mute} />
          <TextInput value={term} onChangeText={setTerm} placeholder="Search people" placeholderTextColor={colors.dim} style={styles.searchInput} accessibilityLabel="Search people" />
        </View>
        <ErrorText>{error}</ErrorText>
      </View>
      {!people ? <ActivityIndicator color={colors.brand} style={{ marginTop: 30 }} /> : null}
      <FlatList
        data={list}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const on = chosen.includes(item.id);
          return (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => (mode === "person" ? void start({ kind: "direct", userId: item.id }) : setChosen(current => (on ? current.filter(id => id !== item.id) : [...current, item.id])))}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#eef1e8" }]}
            >
              <ChatAvatar chat={{ id: item.id, kind: "direct", title: item.name }} size={44} online={item.online} />
              <View style={{ flex: 1 }}>
                <T weight="semibold" size={15}>
                  {item.name}
                </T>
                <T size={12.5} color={colors.mute}>
                  {ROLE_NAMES[item.role] ?? item.role}
                  {item.home ? ` · ${item.home}` : ""}
                </T>
              </View>
              {mode === "group" ? <Icon name={on ? "check-circle" : "circle"} size={22} color={on ? colors.sage : colors.dim} /> : null}
            </Pressable>
          );
        }}
      />
      {mode === "group" ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy || title.trim().length < 2 || !chosen.length}
          onPress={() => void start({ kind: "group", title, members: chosen })}
          style={[styles.create, (busy || title.trim().length < 2 || !chosen.length) && { opacity: 0.5 }]}
        >
          {busy ? <ActivityIndicator color={colors.lime} /> : <Icon name="users" size={18} color={colors.lime} />}
          <T weight="semibold" color="#ffffff">
            Create group with {chosen.length} {chosen.length === 1 ? "person" : "people"}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  toggle: { flexDirection: "row", backgroundColor: "#e8ebe3", borderRadius: 999, padding: 4 },
  toggleItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 999 },
  toggleOn: { backgroundColor: colors.card },
  field: { backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, height: 48, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, height: 42 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 16 },
  create: { position: "absolute", left: 16, right: 16, bottom: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.brand, borderRadius: 18, minHeight: 54 },
});
