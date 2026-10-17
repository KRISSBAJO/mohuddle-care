import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthImage } from "@/components/AuthImage";
import { ChatAvatar } from "@/components/ChatAvatar";
import { ChatBubble, chatFileUrl } from "@/components/ChatBubble";
import { Icon, T, type IconName } from "@/components/ui";
import { API_URL, ApiError } from "@/lib/api";
import { activeChat, durationText, previewOf, QUICK_REACTIONS, useChatEvents, useChatLive, type ChatDetail, type ChatItem, type Message } from "@/lib/chat";
import { fmt } from "@/lib/format";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors, fonts, shadow } from "@/lib/theme";

type Row = { key: string; day?: string; message?: Message };
type SheetName = "" | "actions" | "forward" | "info" | "delete" | "attach" | "person";

const dayOf = (iso: string, zone?: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/*
 * One conversation on the phone: messages arrive live, ticks turn to read, and "typing…" shows. Long
 * press a message to react, reply, copy, forward, star, pin, see who read it, edit or delete. Send
 * text, photos (camera or library), files and voice notes.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { call, me, token } = useSession();
  const { typing: sendTyping } = useChatLive();
  const zone = me?.agency?.zone;
  const myId = me?.user.id;
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [persons, setPersons] = useState<{ id: string; name: string; home: string | null }[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [sheet, setSheet] = useState<SheetName>("");
  const [focus, setFocus] = useState<Message | null>(null);
  const [viewing, setViewing] = useState<Message | null>(null);
  const [typer, setTyper] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  // When the message menu opened, for the edit and delete time limits.
  const [openedAt, setOpenedAt] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordStart, setRecordStart] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const list = useRef<FlatList<Row>>(null);
  const typedAt = useRef(0);
  const typerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fail = useCallback((problem: unknown) => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."), []);

  const loadDetail = useCallback(() => call<ChatDetail>(`/chat/chats/${id}`).then(setDetail, fail), [call, id, fail]);
  const refresh = useCallback(
    () =>
      call<{ messages: Message[]; hasMore: boolean }>(`/chat/chats/${id}/messages?limit=40`).then(data => {
        setMessages(current => {
          const latest = new Set(data.messages.map(item => item.id));
          const older = data.messages.length ? current.filter(item => !latest.has(item.id) && item.at < data.messages[0].at) : current;
          return [...older, ...data.messages];
        });
        setHasMore(current => current || data.hasMore);
      }, fail),
    [call, id, fail],
  );
  const markRead = useCallback(() => call(`/chat/chats/${id}/read`, {}).catch(() => undefined), [call, id]);

  useEffect(() => {
    Promise.all([loadDetail(), refresh()]).finally(() => {
      setLoading(false);
      void markRead();
    });
    call<{ persons: typeof persons }>("/chat/persons").then(data => setPersons(data.persons), () => undefined);
  }, [loadDetail, refresh, markRead, call]);

  // While this chat is open, its notifications are not shown on top of it.
  useFocusEffect(
    useCallback(() => {
      activeChat.id = id;
      return () => {
        activeChat.id = null;
      };
    }, [id]),
  );

  useChatEvents(event => {
    if (event.t === "presence" && event.u) {
      setDetail(current => (current ? { ...current, members: current.members.map(member => (member.id === event.u ? { ...member, online: Boolean(event.online), lastSeenAt: new Date().toISOString() } : member)) } : current));
      return;
    }
    if (event.c !== id) return;
    if (event.t === "typing" && event.n) {
      setTyper(event.n);
      clearTimeout(typerTimer.current);
      typerTimer.current = setTimeout(() => setTyper(""), 4000);
    }
    if (event.t === "message") {
      setTyper("");
      void refresh().then(() => markRead());
    }
    if (event.t === "update" || event.t === "receipt") void refresh();
    if (event.t === "chat" || event.t === "members") {
      void loadDetail();
      void refresh();
    }
    if (event.t === "hello") void refresh();
  });

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Date.now() - recordStart), 250);
    return () => clearInterval(timer);
  }, [recording, recordStart]);

  async function loadOlder() {
    if (!hasMore || !messages.length) return;
    const data = await call<{ messages: Message[]; hasMore: boolean }>(`/chat/chats/${id}/messages?limit=40&before=${encodeURIComponent(messages[0].at)}`).catch(fail);
    if (!data) return;
    setMessages(current => [...data.messages.filter(item => !current.some(existing => existing.id === item.id)), ...current]);
    setHasMore(data.hasMore);
  }

  /* ---------- Sending ---------- */

  async function send() {
    const body = text.trim();
    if (busy || (!body && !person)) return;
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await call(`/chat/messages/${editing.id}/edit`, { body });
        setEditing(null);
      } else {
        const result = await call<{ message: Message }>(`/chat/chats/${id}/messages`, { body, replyToId: replyTo?.id ?? null, personId: person?.id ?? null, mentions: mentions.filter(member => detail?.members.some(item => item.id === member && body.includes(`@${item.name.split(" ")[0]}`))) });
        setMessages(current => (current.some(item => item.id === result.message.id) ? current : [...current, result.message]));
      }
      setText("");
      setReplyTo(null);
      setPerson(null);
      setMentions([]);
      void refresh();
    } catch (problem) {
      fail(problem);
    } finally {
      setBusy(false);
    }
  }

  async function upload(uri: string, type: string, params: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      const blob = await (await fetch(uri)).blob();
      const query = new URLSearchParams({ ...params, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      const response = await fetch(`${API_URL}/api/v1/chat/chats/${id}/attachments?${query}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": type || blob.type || "application/octet-stream" }, body: blob });
      const data = (await response.json().catch(() => ({}))) as { message?: Message; error?: string };
      if (!response.ok || !data.message) throw new ApiError(response.status, "failed", data.error ?? "That could not be sent. Try again.");
      setMessages(current => [...current.filter(item => item.id !== data.message!.id), data.message!]);
      setReplyTo(null);
    } catch (problem) {
      fail(problem);
    } finally {
      setBusy(false);
    }
  }

  async function pickPhoto(camera: boolean) {
    setSheet("");
    const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return fail(new ApiError(0, "denied", camera ? "Allow the camera in your phone's settings to take a photo." : "Allow photos in your phone's settings to send one."));
    const result = camera ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) await upload(asset.uri, asset.mimeType ?? "image/jpeg", { name: asset.fileName ?? "Photo.jpg", ...(text.trim() ? { caption: text.trim() } : {}) });
    if (text.trim()) setText("");
  }

  async function pickFile() {
    setSheet("");
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) await upload(asset.uri, asset.mimeType ?? "application/octet-stream", { name: asset.name });
  }

  async function startRecording() {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return fail(new ApiError(0, "denied", "Allow the microphone in your phone's settings to record a voice note."));
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordStart(Date.now());
    setElapsed(0);
    setRecording(true);
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  async function stopRecording(sendIt: boolean) {
    const length = Date.now() - recordStart;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    setRecording(false);
    if (sendIt && recorder.uri && length > 600) await upload(recorder.uri, Platform.OS === "web" ? "" : "audio/m4a", { voice: "1", name: "Voice note", durationMs: String(length) });
  }

  /* ---------- Message actions ---------- */

  const act = async (path: string, body: object) => {
    setSheet("");
    try {
      await call(path, body);
      await refresh();
    } catch (problem) {
      fail(problem);
    }
  };
  const jump = (messageId: string) => {
    const index = rows.findIndex(row => row.message?.id === messageId);
    if (index < 0) return;
    list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    setHighlight(messageId);
    setTimeout(() => setHighlight(null), 1600);
  };
  async function openFile(message: Message) {
    try {
      if (Platform.OS === "web") {
        const response = await fetch(chatFileUrl(message.id), { headers: { authorization: `Bearer ${token}` } });
        window.open(URL.createObjectURL(await response.blob()), "_blank");
        return;
      }
      const folder = new Directory(Paths.cache, "chat");
      if (!folder.exists) folder.create();
      const target = new File(folder, `${message.id}-${message.attachment?.name ?? "file"}`);
      const file = target.exists ? target : await File.downloadFileAsync(chatFileUrl(message.id), target, { headers: { authorization: `Bearer ${token ?? ""}` }, idempotent: true });
      await Sharing.shareAsync(file.uri, { mimeType: message.attachment?.contentType });
    } catch {
      fail(new ApiError(0, "failed", "That file could not be opened. Try again."));
    }
  }

  /* ---------- What to show ---------- */

  const rows: Row[] = [];
  messages.forEach((message, index) => {
    const previous = messages[index - 1];
    if (!previous || dayOf(previous.at, zone) !== dayOf(message.at, zone)) rows.push({ key: `day-${message.at}`, day: message.at });
    rows.push({ key: message.id, message });
  });
  rows.reverse();
  const group = detail ? detail.kind !== "direct" : false;
  const other = detail?.kind === "direct" ? detail.members.find(member => member.id !== myId) : null;
  const subtitle = typer ? `${group ? `${typer} is ` : ""}typing…` : other ? (other.online ? "online" : other.lastSeenAt ? `last seen ${fmt.time(other.lastSeenAt, zone)}` : "") : detail ? `${detail.members.length} members` : "";
  const mentionMatch = /(^|\s)@([\p{L}]*)$/u.exec(text);
  const mentionOptions = mentionMatch && detail ? detail.members.filter(member => member.id !== myId && member.name.toLowerCase().includes(mentionMatch[2].toLowerCase())).slice(0, 5) : [];
  const ownFocus = focus?.sender?.id === myId;
  const age = focus ? openedAt - new Date(focus.at).getTime() : 0;
  const canEdit = Boolean(focus && ownFocus && focus.kind !== "system" && detail && age <= detail.rules.editMinutes * 60_000);
  const canDeleteAll = Boolean(focus && detail && ((ownFocus && age <= detail.rules.deleteHours * 3_600_000) || detail.can.moderate));
  const canPin = Boolean(detail && (detail.kind === "direct" || detail.me.admin || detail.can.moderate));

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBack("/chat")} style={styles.iconButton}>
          <Icon name="chevron-left" size={24} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Chat info" onPress={() => router.push(`/chat-info?id=${id}`)} style={styles.headerMain}>
          {detail ? <ChatAvatar chat={detail} size={40} online={other?.online} /> : null}
          <View style={{ flex: 1 }}>
            <T weight="bold" size={16} numberOfLines={1}>
              {detail?.title ?? ""}
            </T>
            <T size={12.5} numberOfLines={1} color={typer ? colors.sage : colors.mute} weight={typer ? "semibold" : "regular"}>
              {subtitle}
            </T>
          </View>
        </Pressable>
      </SafeAreaView>
      {detail?.pinned.length ? (
        <Pressable onPress={() => jump(detail.pinned[0].id)} style={styles.pinned}>
          <Icon name="bookmark" size={14} color={colors.sage} />
          <T size={13} numberOfLines={1} style={{ flex: 1 }}>
            {detail.pinned[0].body || previewOf(detail.pinned[0].kind, "")}
          </T>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            ref={list}
            data={rows}
            inverted
            keyExtractor={row => row.key}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.3}
            onScrollToIndexFailed={() => undefined}
            contentContainerStyle={{ paddingVertical: 10 }}
            ListHeaderComponent={
              typer ? (
                <View style={[styles.typing, shadow.soft]}>
                  <T size={13} color={colors.mute}>
                    {typer} is typing…
                  </T>
                </View>
              ) : null
            }
            renderItem={({ item, index }) => {
              if (item.day)
                return (
                  <View style={styles.dayRow}>
                    <View style={styles.day}>
                      <T size={12} weight="semibold" color={colors.mute}>
                        {fmt.dayShort(item.day, zone)}
                      </T>
                    </View>
                  </View>
                );
              const message = item.message!;
              const older = rows[index + 1]?.message;
              return (
                <ChatBubble
                  message={message}
                  mine={message.sender?.id === myId}
                  group={group}
                  showSender={!older || older.sender?.id !== message.sender?.id || older.kind === "system"}
                  zone={zone}
                  token={token}
                  highlighted={highlight === message.id}
                  onJump={jump}
                  onOpenImage={setViewing}
                  onOpenFile={message => void openFile(message)}
                  onReact={(message, emoji) => void act(`/chat/messages/${message.id}/react`, { emoji })}
                  onLongPress={message => {
                    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setFocus(message);
                    setOpenedAt(Date.now());
                    setSheet("actions");
                  }}
                />
              );
            }}
          />
        )}

        {error ? (
          <Pressable onPress={() => setError("")} style={styles.error}>
            <T size={13} color="#ffffff">
              {error}
            </T>
          </Pressable>
        ) : null}

        {detail && !detail.can.post ? (
          <View style={styles.readOnly}>
            <T size={13} color={colors.mute} style={{ textAlign: "center" }}>
              Only coordinators and administrators post in Announcements.
            </T>
          </View>
        ) : (
          <SafeAreaView edges={["bottom"]} style={styles.composerWrap}>
            {replyTo || editing ? (
              <View style={styles.replyBar}>
                <View style={{ flex: 1 }}>
                  <T size={12.5} weight="bold" color={colors.sage}>
                    {editing ? "Editing message" : `Replying to ${replyTo?.sender?.name ?? "message"}`}
                  </T>
                  <T size={13} color={colors.mute} numberOfLines={1}>
                    {previewOf((editing ?? replyTo)!.kind, (editing ?? replyTo)!.body)}
                  </T>
                </View>
                <Pressable accessibilityLabel="Cancel" onPress={() => { setReplyTo(null); if (editing) { setEditing(null); setText(""); } }} style={styles.iconButton}>
                  <Icon name="x" size={18} color={colors.mute} />
                </Pressable>
              </View>
            ) : null}
            {person ? (
              <Pressable onPress={() => setPerson(null)} style={styles.personChip}>
                <Icon name="user" size={13} color={colors.skyInk} />
                <T size={12.5} weight="semibold" color={colors.skyInk}>
                  About {person.name} ✕
                </T>
              </Pressable>
            ) : null}
            {mentionOptions.length ? (
              <View style={[styles.mentions, shadow.soft]}>
                {mentionOptions.map(member => (
                  <Pressable
                    key={member.id}
                    onPress={() => {
                      setText(current => current.replace(/@[\p{L}]*$/u, `@${member.name.split(" ")[0]} `));
                      setMentions(current => [...new Set([...current, member.id])]);
                    }}
                    style={styles.mention}
                  >
                    <T weight="semibold">{member.name}</T>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {recording ? (
              <View style={styles.recording}>
                <Pressable accessibilityLabel="Cancel the recording" onPress={() => void stopRecording(false)} style={styles.iconButton}>
                  <Icon name="trash-2" size={20} color={colors.flag} />
                </Pressable>
                <View style={styles.recDot} />
                <T weight="semibold" style={{ flex: 1 }}>
                  {durationText(elapsed)}
                </T>
                <Pressable accessibilityLabel="Send the voice note" onPress={() => void stopRecording(true)} style={styles.send}>
                  <Icon name="send" size={19} color={colors.lime} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.composer}>
                <View style={styles.inputBox}>
                  {!editing && detail?.can.attach ? (
                    <Pressable accessibilityLabel="Attach" onPress={() => setSheet("attach")} style={styles.inputIcon}>
                      <Icon name="plus" size={22} color={colors.mute} />
                    </Pressable>
                  ) : null}
                  <TextInput
                    value={text}
                    onChangeText={value => {
                      setText(value);
                      if (Date.now() - typedAt.current > 2500) {
                        typedAt.current = Date.now();
                        sendTyping(id);
                      }
                    }}
                    placeholder={editing ? "Edit your message" : "Message"}
                    placeholderTextColor={colors.dim}
                    multiline
                    maxLength={4000}
                    style={styles.input}
                    accessibilityLabel="Message"
                  />
                  {!editing ? (
                    <Pressable accessibilityLabel="Tag a person supported" onPress={() => setSheet("person")} style={styles.inputIcon}>
                      <Icon name="user" size={20} color={person ? colors.sage : colors.mute} />
                    </Pressable>
                  ) : null}
                </View>
                {text.trim() || person || editing || !detail?.can.attach ? (
                  <Pressable accessibilityLabel={editing ? "Save" : "Send"} disabled={busy} onPress={() => void send()} style={[styles.send, busy && { opacity: 0.6 }]}>
                    {busy ? <ActivityIndicator color={colors.lime} /> : <Icon name={editing ? "check" : "send"} size={19} color={colors.lime} />}
                  </Pressable>
                ) : (
                  <Pressable accessibilityLabel="Record a voice note" disabled={busy} onPress={() => void startRecording()} style={[styles.send, busy && { opacity: 0.6 }]}>
                    {busy ? <ActivityIndicator color={colors.lime} /> : <Icon name="mic" size={20} color={colors.lime} />}
                  </Pressable>
                )}
              </View>
            )}
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>

      {/* Long press: reactions and actions */}
      <Sheet visible={sheet === "actions" && Boolean(focus)} onClose={() => setSheet("")}>
        {focus ? (
          <>
            <View style={styles.reactRow}>
              {QUICK_REACTIONS.map(emoji => (
                <Pressable key={emoji} onPress={() => void act(`/chat/messages/${focus.id}/react`, { emoji: focus.reactions.find(item => item.mine)?.emoji === emoji ? null : emoji })} style={styles.reactButton}>
                  <T size={26}>{emoji}</T>
                </Pressable>
              ))}
            </View>
            <Action icon="corner-up-left" label="Reply" onPress={() => { setSheet(""); setEditing(null); setReplyTo(focus); }} />
            {focus.body ? <Action icon="copy" label="Copy" onPress={() => { setSheet(""); void Clipboard.setStringAsync(focus.body); }} /> : null}
            <Action icon="corner-up-right" label="Forward" onPress={() => setSheet("forward")} />
            <Action icon="star" label={focus.starred ? "Unstar" : "Star"} onPress={() => void act(`/chat/messages/${focus.id}/star`, { starred: !focus.starred })} />
            {canPin ? <Action icon="bookmark" label={focus.pinned ? "Unpin" : "Pin"} onPress={() => void act(`/chat/messages/${focus.id}/pin`, { pinned: !focus.pinned }).then(() => loadDetail())} /> : null}
            {ownFocus ? <Action icon="info" label="Message info" onPress={() => setSheet("info")} /> : null}
            {canEdit ? <Action icon="edit-2" label="Edit" onPress={() => { setSheet(""); setReplyTo(null); setEditing(focus); setText(focus.body); }} /> : null}
            <Action icon="trash-2" label="Delete" danger onPress={() => setSheet("delete")} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={sheet === "delete" && Boolean(focus)} onClose={() => setSheet("")} title="Delete message?">
        {canDeleteAll ? <Action icon="trash-2" label="Delete for everyone" danger onPress={() => void act(`/chat/messages/${focus!.id}/delete`, { scope: "everyone" })} /> : null}
        <Action icon="eye-off" label="Delete for me" onPress={() => { const target = focus!; void act(`/chat/messages/${target.id}/delete`, { scope: "me" }).then(() => setMessages(current => current.filter(item => item.id !== target.id))); }} />
        <T size={12} color={colors.mute} style={{ textAlign: "center", marginTop: 8 }}>
          A copy is kept for your agency&apos;s records.
        </T>
      </Sheet>

      <Sheet visible={sheet === "attach"} onClose={() => setSheet("")} title="Send">
        {Platform.OS !== "web" ? <Action icon="camera" label="Camera" onPress={() => void pickPhoto(true)} /> : null}
        <Action icon="image" label="Photo from your library" onPress={() => void pickPhoto(false)} />
        <Action icon="file" label="File (PDF, Word, Excel…)" onPress={() => void pickFile()} />
      </Sheet>

      <Sheet visible={sheet === "person"} onClose={() => setSheet("")} title="Who is this about?">
        <View style={{ maxHeight: 380 }}>
          <FlatList
            data={persons}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <Pressable onPress={() => { setPerson(item); setSheet(""); }} style={styles.pickRow}>
                <T weight="semibold" style={{ flex: 1 }}>
                  {item.name}
                </T>
                <T size={12} color={colors.mute}>
                  {item.home ?? ""}
                </T>
              </Pressable>
            )}
          />
        </View>
      </Sheet>

      {sheet === "forward" && focus ? <ForwardSheet message={focus} onClose={() => setSheet("")} onDone={() => setSheet("")} fail={fail} /> : null}
      {sheet === "info" && focus ? <InfoSheet message={focus} zone={zone} onClose={() => setSheet("")} /> : null}

      <Modal visible={Boolean(viewing)} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing ? <AuthImage url={chatFileUrl(viewing.id)} token={token} label={viewing.attachment?.name ?? "Photo"} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
          <SafeAreaView edges={["top"]} style={styles.viewerBar}>
            <Pressable accessibilityLabel="Close" onPress={() => setViewing(null)} style={[styles.iconButton, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
              <Icon name="x" size={22} color="#ffffff" />
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

/* ---------- Sheets ---------- */

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.grabber} />
        {title ? (
          <T weight="bold" size={17} style={{ marginBottom: 8, paddingHorizontal: 4 }}>
            {title}
          </T>
        ) : null}
        {children}
      </SafeAreaView>
    </Modal>
  );
}

function Action({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && { backgroundColor: "#f0f2ec" }]}>
      <Icon name={icon} size={19} color={danger ? colors.flag : colors.mute} />
      <T size={16} color={danger ? colors.flag : colors.ink}>
        {label}
      </T>
    </Pressable>
  );
}

function ForwardSheet({ message, onClose, onDone, fail }: { message: Message; onClose: () => void; onDone: () => void; fail: (problem: unknown) => void }) {
  const { call } = useSession();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call<{ chats: ChatItem[] }>("/chat/chats").then(data => setChats(data.chats.filter(item => !item.archived)), fail);
  }, [call, fail]);
  return (
    <Sheet visible onClose={onClose} title="Forward to">
      <View style={{ maxHeight: 360 }}>
        <FlatList
          data={chats}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const on = chosen.includes(item.id);
            return (
              <Pressable onPress={() => setChosen(current => (on ? current.filter(id => id !== item.id) : [...current, item.id]))} style={styles.pickRow}>
                <ChatAvatar chat={item} size={36} />
                <T weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                  {item.title}
                </T>
                <Icon name={on ? "check-circle" : "circle"} size={20} color={on ? colors.sage : colors.dim} />
              </Pressable>
            );
          }}
        />
      </View>
      <Pressable
        disabled={!chosen.length || busy}
        onPress={async () => {
          setBusy(true);
          try {
            for (const target of chosen) await call(`/chat/chats/${target}/messages`, { forwardOf: message.id });
            onDone();
          } catch (problem) {
            fail(problem);
          } finally {
            setBusy(false);
          }
        }}
        style={[styles.primary, (!chosen.length || busy) && { opacity: 0.5 }]}
      >
        {busy ? <ActivityIndicator color="#ffffff" /> : null}
        <T weight="semibold" color="#ffffff">
          Forward{chosen.length ? ` to ${chosen.length}` : ""}
        </T>
      </Pressable>
    </Sheet>
  );
}

function InfoSheet({ message, zone, onClose }: { message: Message; zone?: string; onClose: () => void }) {
  const { call } = useSession();
  const [info, setInfo] = useState<{ readBy: { id: string; name: string; at: string }[]; deliveredTo: { id: string; name: string; at: string }[]; waiting: { id: string; name: string }[] } | null>(null);
  useEffect(() => {
    call<NonNullable<typeof info>>(`/chat/messages/${message.id}/info`).then(setInfo, () => undefined);
  }, [call, message.id]);
  const part = (title: string, rows: { id: string; name: string; at?: string }[], color: string) =>
    rows.length ? (
      <View style={{ marginTop: 10 }}>
        <T size={11} weight="bold" color={color} style={{ letterSpacing: 1, marginBottom: 4 }}>
          {title.toUpperCase()}
        </T>
        {rows.map(row => (
          <View key={row.id} style={styles.infoRow}>
            <T style={{ flex: 1 }}>{row.name}</T>
            {row.at ? (
              <T size={12} color={colors.mute}>
                {fmt.time(row.at, zone)}
              </T>
            ) : null}
          </View>
        ))}
      </View>
    ) : null;
  return (
    <Sheet visible onClose={onClose} title="Message info">
      {!info ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <>
          {part("Read by", info.readBy, colors.sage)}
          {part("Delivered to", info.deliveredTo, colors.mute)}
          {part("Not received yet", info.waiting, colors.dim)}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#eef1e8" },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingBottom: 8, backgroundColor: colors.ground, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headerMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pinned: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  dayRow: { alignItems: "center", marginVertical: 8 },
  day: { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  typing: { alignSelf: "flex-start", backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 10, marginTop: 4 },
  error: { position: "absolute", top: 10, alignSelf: "center", backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, maxWidth: "90%" },
  readOnly: { backgroundColor: colors.card, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  composerWrap: { backgroundColor: "#f6f7f2", paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  inputBox: { flex: 1, flexDirection: "row", alignItems: "flex-end", backgroundColor: colors.card, borderRadius: 24, paddingHorizontal: 4, minHeight: 46 },
  inputIcon: { width: 38, height: 44, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, maxHeight: 120, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  replyBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: 14, borderLeftWidth: 4, borderLeftColor: colors.sage, paddingLeft: 12, paddingVertical: 6, marginBottom: 6 },
  personChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.sky, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 6 },
  mentions: { backgroundColor: colors.card, borderRadius: 14, marginBottom: 6, overflow: "hidden" },
  mention: { paddingHorizontal: 14, paddingVertical: 10 },
  recording: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 24, paddingLeft: 4, paddingRight: 0 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.flag },
  backdrop: { flex: 1, backgroundColor: "rgba(22,33,30,0.35)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 12 },
  reactRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#f4f6f0", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  reactButton: { padding: 4 },
  action: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 8, paddingVertical: 13, borderRadius: 12 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 6 },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, borderRadius: 16, minHeight: 50, marginTop: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  viewer: { flex: 1, backgroundColor: "#000000" },
  viewerBar: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 8 },
});
