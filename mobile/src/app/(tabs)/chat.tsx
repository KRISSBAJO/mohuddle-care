import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText, Icon, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ChatAvatar } from "@/components/ChatAvatar";
import { previewOf, useChatEvents, useChatLive, type ChatItem } from "@/lib/chat";
import { whenText } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, fonts, shadow } from "@/lib/theme";

type Filter = "all" | "unread" | "groups" | "archived";
type Line = ChatItem | { label: string };

/*
 * The Chats tab: every conversation, newest first, with unread counts and live "typing…". Home groups
 * and Announcements are there already; the round button starts a chat or a group.
 */
export default function ChatsScreen() {
  const { call, me } = useSession();
  const { live } = useChatLive();
  const zone = me?.agency?.zone;
  const [chats, setChats] = useState<ChatItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [results, setResults] = useState<{ id: string; chatId: string; body: string; at: string; sender: string | null; chatTitle: string; chatKind: string }[]>([]);
  // Messages that match the search, across all your chats, a moment after you stop typing.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => {
      call<{ results: typeof results }>(`/chat/search?q=${encodeURIComponent(query.trim())}`).then(data => setResults(data.results), () => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, call]);

  const load = useCallback(
    () =>
      call<{ chats: ChatItem[] }>("/chat/chats").then(
        data => {
          setChats(data.chats);
          setError("");
          call("/chat/delivered", {}).catch(() => undefined);
        },
        problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
      ),
    [call],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // Without the live connection, check for news every few seconds instead.
  useEffect(() => {
    if (live) return;
    const timer = setInterval(() => void load(), 6000);
    return () => clearInterval(timer);
  }, [live, load]);
  useChatEvents(event => {
    if (event.t === "typing" && event.c && event.n) {
      const chatId = event.c;
      const name = event.n;
      setTyping(current => ({ ...current, [chatId]: name }));
      clearTimeout(typingTimers.current[chatId]);
      typingTimers.current[chatId] = setTimeout(() => setTyping(current => ({ ...current, [chatId]: "" })), 4000);
      return;
    }
    if (["message", "chat", "chats", "members", "receipt", "hello"].includes(event.t)) void load();
    if (event.t === "presence" && event.u) setChats(current => current?.map(item => (item.other?.id === event.u ? { ...item, other: { ...item.other!, online: Boolean(event.online) } } : item)) ?? current);
  });

  const listed = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (chats ?? []).filter(item => {
      if (filter === "archived" ? !item.archived : item.archived) return false;
      if (filter === "unread" && !item.unread) return false;
      if (filter === "groups" && item.kind === "direct") return false;
      return !term || item.title.toLowerCase().includes(term);
    });
  }, [chats, filter, query]);
  const typingIn = (chatId: string) => typing[chatId] ?? "";
  // Pinned chats first under their own heading, then the rest.
  const pinned = !query.trim() && filter !== "archived" ? listed.filter(item => item.pinned) : [];
  const lines: Line[] = pinned.length ? [{ label: "PINNED" }, ...pinned, ...(listed.length > pinned.length ? [{ label: "RECENT" }] : []), ...listed.filter(item => !item.pinned)] : listed;
  const totalUnread = (chats ?? []).filter(item => !item.archived && !item.muted).reduce((sum, item) => sum + item.unread, 0);
  const unreadChats = (chats ?? []).filter(item => !item.archived && item.unread).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <StatusBar style="dark" />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.titleRow}>
          <View>
            <View style={styles.titleLine}>
              <T weight="bold" size={30} style={{ letterSpacing: -0.9 }}>
                Chats
              </T>
              {totalUnread ? (
                <View style={styles.countPill}>
                  <T size={12} weight="bold" color="#ffffff">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </T>
                </View>
              ) : null}
            </View>
            <View style={styles.liveLine}>
              <View style={[styles.liveDot, { backgroundColor: live ? "#22b26b" : "#e0a43a" }]} />
              <T size={12} weight="semibold" color={colors.mute}>
                {live ? "Live" : "Reconnecting…"}
              </T>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Starred messages" onPress={() => router.push("/chat-starred")} style={styles.headerButton}>
            <Icon name="star" size={19} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Icon name="search" size={16} color={colors.mute} />
          <TextInput
            value={query}
            onChangeText={value => {
              setQuery(value);
              if (value.trim().length < 2) setResults([]);
            }}
            placeholder="Search chats and messages"
            placeholderTextColor={colors.dim}
            style={styles.searchInput}
            accessibilityLabel="Search chats and messages"
          />
        </View>
        <View style={styles.segment}>
          {(
            [
              ["all", "All"],
              ["unread", unreadChats ? `Unread ${unreadChats}` : "Unread"],
              ["groups", "Groups"],
              ["archived", "Archived"],
            ] as const
          ).map(([value, label]) => (
            <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.segmentItem, filter === value && [styles.segmentOn, shadow.soft]]}>
              <T size={13} weight="semibold" color={filter === value ? colors.ink : colors.mute} numberOfLines={1}>
                {label}
              </T>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
      <View style={{ paddingHorizontal: 20 }}>
        <ErrorText>{error}</ErrorText>
      </View>
      <FlatList<Line>
        data={lines}
        keyExtractor={item => ("label" in item ? item.label : item.id)}
        contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
        ListFooterComponent={
          results.length && query.trim().length >= 2 ? (
            <View style={{ marginTop: 10 }}>
              <T size={11} weight="bold" color={colors.dim} style={{ letterSpacing: 1, paddingHorizontal: 10, marginBottom: 4 }}>
                MESSAGES
              </T>
              {results.map(result => (
                <Pressable key={result.id} accessibilityRole="button" onPress={() => router.push(`/conversation?id=${result.chatId}&m=${result.id}`)} style={({ pressed }) => [styles.result, pressed && { backgroundColor: "#eef1e8" }]}>
                  <View style={styles.between}>
                    <T size={13} weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                      {result.chatKind === "direct" ? (result.sender ?? "") : result.chatTitle}
                    </T>
                    <T size={12} color={colors.dim}>
                      {whenText(result.at, zone)}
                    </T>
                  </View>
                  <T size={13.5} color={colors.mute} numberOfLines={2}>
                    {result.sender && result.chatKind !== "direct" ? `${result.sender.split(" ")[0]}: ` : ""}
                    {result.body}
                  </T>
                </Pressable>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          chats ? (
            <T color={colors.mute} style={{ textAlign: "center", marginTop: 40 }}>
              {filter === "unread" ? "You're all caught up." : query ? "No chats by that name." : "No chats here yet."}
            </T>
          ) : null
        }
        renderItem={({ item }) => {
          if ("label" in item)
            return (
              <T size={11} weight="bold" color={colors.dim} style={styles.section}>
                {item.label}
              </T>
            );
          const typer = typingIn(item.id);
          const last = item.lastMessage;
          const preview = typer
            ? `${item.kind === "direct" ? "" : `${typer} is `}typing…`
            : !last
              ? item.kind === "home"
                ? "Your home's group"
                : item.kind === "announcements"
                  ? "News from the office"
                  : "Say hello"
              : last.deleted
                ? "This message was deleted"
                : `${last.senderId === me?.user.id ? "You: " : item.kind !== "direct" && last.senderName ? `${last.senderName.split(" ")[0]}: ` : ""}${previewOf(last.kind, last.body)}`;
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}${item.unread ? `, ${item.unread} unread` : ""}`} onPress={() => router.push(`/conversation?id=${item.id}`)} style={({ pressed }) => [styles.row, pressed && [styles.rowPressed, shadow.soft]]}>
              <ChatAvatar chat={item} online={item.other?.online} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.between}>
                  <T weight={item.unread ? "bold" : "semibold"} size={16} numberOfLines={1} style={{ flex: 1, letterSpacing: -0.2 }}>
                    {item.title}
                  </T>
                  <T size={12} weight={item.unread ? "bold" : "regular"} color={item.unread ? colors.sage : colors.dim}>
                    {item.lastMessageAt ? whenText(item.lastMessageAt, zone) : ""}
                  </T>
                </View>
                <View style={styles.between}>
                  <T size={14} numberOfLines={1} color={typer ? colors.sage : item.unread ? colors.ink : colors.mute} weight={typer ? "semibold" : "regular"} style={{ flex: 1, opacity: item.unread && !typer ? 0.8 : 1 }}>
                    {preview}
                  </T>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    {item.muted ? <Icon name="bell-off" size={14} color={colors.dim} /> : null}
                    {item.pinned ? <Icon name="bookmark" size={14} color={colors.dim} /> : null}
                    {item.mentioned ? (
                      <View style={styles.badge}>
                        <T size={11} weight="bold" color="#ffffff">
                          @
                        </T>
                      </View>
                    ) : null}
                    {item.unread ? (
                      <View style={[styles.badge, item.muted && { backgroundColor: colors.dim }]}>
                        <T size={11} weight="bold" color="#ffffff">
                          {item.unread > 99 ? "99+" : item.unread}
                        </T>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={() => router.push("/chat-new")} style={({ pressed }) => [styles.fab, shadow.float, pressed && { opacity: 0.85 }]}>
        <Icon name="edit" size={22} color={colors.lime} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, paddingHorizontal: 14, marginTop: 14, height: 44 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  countPill: { backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  liveLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  segment: { flexDirection: "row", gap: 4, marginTop: 12, backgroundColor: "#e9ede4", borderRadius: 14, padding: 4 },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10 },
  segmentOn: { backgroundColor: colors.card },
  section: { letterSpacing: 1.4, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, paddingVertical: 11, borderRadius: 18 },
  rowPressed: { backgroundColor: colors.card },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  result: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 14, gap: 2 },
  headerButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  badge: { minWidth: 21, height: 21, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 22, bottom: 100, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
