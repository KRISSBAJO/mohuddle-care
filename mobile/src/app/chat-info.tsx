import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ChatAvatar } from "@/components/ChatAvatar";
import { ScreenBar } from "@/components/ScreenBar";
import { ErrorText, Icon, T, type IconName } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useChatEvents, type ChatDetail, type Person } from "@/lib/chat";
import { fmt } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, fonts, shadow } from "@/lib/theme";

/* A chat's details: name and description for groups, notifications, pinning, archiving, members and leaving. */
export default function ChatInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [title, setTitle] = useState("");
  const [about, setAbout] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const fail = (problem: unknown) => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");

  const load = useCallback(
    () =>
      call<ChatDetail>(`/chat/chats/${id}`).then(
        data => {
          setDetail(data);
          setTitle(data.title);
          setAbout(data.about);
        },
        problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
      ),
    [call, id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useChatEvents(event => {
    if (event.c === id && (event.t === "chat" || event.t === "members")) void load();
  });

  const change = async (path: string, body: object) => {
    setError("");
    try {
      await call(`/chat/chats/${id}/${path}`, body);
      await load();
    } catch (problem) {
      fail(problem);
    }
  };

  if (!detail)
    return (
      <View style={styles.page}>
        <ScreenBar title="Chat info" />
        <View style={{ padding: 20 }}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.brand} />}</View>
      </View>
    );

  const candidates = (people ?? []).filter(person => !detail.members.some(member => member.id === person.id));
  return (
    <View style={styles.page}>
      <ScreenBar title={detail.kind === "direct" ? "Contact info" : "Group info"} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}>
        <View style={[styles.card, { alignItems: "center", gap: 6 }, shadow.soft]}>
          <ChatAvatar chat={detail} size={86} />
          {detail.can.rename ? (
            <>
              <TextInput value={title} onChangeText={setTitle} onBlur={() => title.trim() !== detail.title && void change("group", { title })} maxLength={80} style={styles.title} accessibilityLabel="Group name" />
              <TextInput value={about} onChangeText={setAbout} onBlur={() => about !== detail.about && void change("group", { about })} maxLength={500} placeholder="Add a description" placeholderTextColor={colors.dim} multiline style={styles.about} accessibilityLabel="Group description" />
            </>
          ) : (
            <>
              <T weight="bold" size={21} style={{ marginTop: 6, textAlign: "center" }}>
                {detail.title}
              </T>
              {detail.about ? (
                <T size={14} color={colors.mute} style={{ textAlign: "center" }}>
                  {detail.about}
                </T>
              ) : null}
            </>
          )}
          {detail.kind !== "direct" ? (
            <T size={12} color={colors.dim}>
              {detail.members.length} members
            </T>
          ) : null}
        </View>
        <ErrorText>{error}</ErrorText>

        <View style={[styles.card, shadow.soft]}>
          <T size={11} weight="bold" color={colors.dim} style={styles.label}>
            NOTIFICATIONS
          </T>
          {detail.me.muted ? (
            <Row icon="bell" label={`Unmute (muted until ${fmt.dayShort(detail.me.mutedUntil!, zone)})`} onPress={() => void change("preferences", { mutedHours: null })} />
          ) : (
            <View style={styles.chips}>
              {(
                [
                  [8, "Mute 8 hours"],
                  [168, "1 week"],
                  [24 * 365 * 10, "Always"],
                ] as const
              ).map(([hours, label]) => (
                <Pressable key={hours} accessibilityRole="button" onPress={() => void change("preferences", { mutedHours: hours })} style={styles.chip}>
                  <T size={13} weight="semibold" color={colors.mute}>
                    {label}
                  </T>
                </Pressable>
              ))}
            </View>
          )}
          <Row icon="bookmark" label={detail.me.pinned ? "Unpin chat" : "Pin chat to the top"} onPress={() => void change("preferences", { pinned: !detail.me.pinned })} />
          <Row icon="archive" label={detail.me.archived ? "Unarchive chat" : "Archive chat"} onPress={() => void change("preferences", { archived: !detail.me.archived })} />
        </View>

        {detail.kind !== "direct" ? (
          <View style={[styles.card, shadow.soft]}>
            <View style={styles.between}>
              <T size={11} weight="bold" color={colors.dim} style={styles.label}>
                {detail.members.length} MEMBERS
              </T>
              {detail.can.manageMembers ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setAdding(!adding);
                    if (!people) call<{ people: Person[] }>("/chat/people").then(data => setPeople(data.people), fail);
                  }}
                >
                  <T size={13} weight="semibold" color={colors.sage}>
                    {adding ? "Done" : "+ Add"}
                  </T>
                </Pressable>
              ) : null}
            </View>
            {adding
              ? candidates.map(person => (
                  <Pressable key={person.id} accessibilityRole="button" onPress={() => void change("members", { add: [person.id] })} style={styles.member}>
                    <ChatAvatar chat={{ id: person.id, kind: "direct", title: person.name }} size={36} />
                    <T style={{ flex: 1 }}>{person.name}</T>
                    <Icon name="plus-circle" size={20} color={colors.sage} />
                  </Pressable>
                ))
              : null}
            {detail.members.map(member => (
              <View key={member.id} style={styles.member}>
                <ChatAvatar chat={{ id: member.id, kind: "direct", title: member.name }} size={38} online={member.online} />
                <View style={{ flex: 1 }}>
                  <T weight="semibold">{member.id === me?.user.id ? "You" : member.name}</T>
                  {member.home ? (
                    <T size={12} color={colors.mute} numberOfLines={1}>
                      {member.home}
                    </T>
                  ) : null}
                  <T size={12} color={colors.mute}>
                    {member.online ? "online" : member.lastSeenAt ? `last seen ${fmt.dayShort(member.lastSeenAt, zone)} ${fmt.time(member.lastSeenAt, zone)}` : "not on chat yet"}
                  </T>
                </View>
                {member.admin ? (
                  <View style={styles.admin}>
                    <T size={11} weight="semibold" color={colors.skyInk}>
                      Admin
                    </T>
                  </View>
                ) : null}
                {member.id !== me?.user.id ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${member.name}`}
                    onPress={async () => {
                      try {
                        const result = await call<{ chatId: string }>("/chat/chats", { kind: "direct", userId: member.id });
                        router.push(`/conversation?id=${result.chatId}`);
                      } catch (problem) {
                        fail(problem);
                      }
                    }}
                    style={{ padding: 6 }}
                  >
                    <Icon name="message-circle" size={18} color={colors.sage} />
                  </Pressable>
                ) : null}
                {detail.kind === "group" && detail.can.manageMembers ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={member.admin ? `Dismiss ${member.name} as admin` : `Make ${member.name} an admin`} onPress={() => void change("members", member.admin ? { dismiss: [member.id] } : { admin: [member.id] })} style={styles.roleButton}>
                    <T size={11.5} weight="semibold" color={colors.sage}>
                      {member.admin ? "Dismiss" : "Make admin"}
                    </T>
                  </Pressable>
                ) : null}
                {detail.can.manageMembers && member.id !== me?.user.id && !member.auto ? (
                  <Pressable accessibilityLabel={`Remove ${member.name}`} onPress={() => void change("members", { remove: [member.id] })} style={{ padding: 6 }}>
                    <Icon name="x" size={18} color={colors.mute} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {detail.can.leave ? (
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              try {
                await call(`/chat/chats/${id}/members`, { leave: true });
                router.replace("/chat");
              } catch (problem) {
                fail(problem);
              }
            }}
            style={[styles.card, styles.leave, shadow.soft]}
          >
            <Icon name="log-out" size={18} color={colors.flag} />
            <T color={colors.flag} weight="semibold">
              Leave group
            </T>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={18} color={colors.mute} />
      <T style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 16 },
  title: { fontFamily: fonts.bold, fontSize: 21, color: colors.ink, textAlign: "center", marginTop: 6, minWidth: 200 },
  about: { fontFamily: fonts.regular, fontSize: 14, color: colors.mute, textAlign: "center", minWidth: 220 },
  label: { letterSpacing: 1, marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: { backgroundColor: "#eceee8", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  member: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  admin: { backgroundColor: colors.sky, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  leave: { flexDirection: "row", alignItems: "center", gap: 10 },
  roleButton: { borderRadius: 999, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 8, paddingVertical: 3 },
});
