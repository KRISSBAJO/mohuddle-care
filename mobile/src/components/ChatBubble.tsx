import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { API_URL } from "@/lib/api";
import { colorFor, durationText, previewOf, sizeText, type Message } from "@/lib/chat";
import { fmt } from "@/lib/format";
import { colors } from "@/lib/theme";
import { AuthImage } from "./AuthImage";
import { Icon, T } from "./ui";

export const chatFileUrl = (id: string) => `${API_URL}/api/v1/chat/messages/${id}/file`;

/* One tick when sent; two when it reached the other phones; two in lime when read. */
function Ticks({ status, color }: { status: Message["status"]; color: string }) {
  return (
    <View style={{ flexDirection: "row", width: status === "sent" ? 13 : 18 }} accessibilityLabel={status === "read" ? "Read" : status === "delivered" ? "Delivered" : "Sent"}>
      <Icon name="check" size={13} color={color} />
      {status !== "sent" ? (
        <View style={{ marginLeft: -8 }}>
          <Icon name="check" size={13} color={color} />
        </View>
      ) : null}
    </View>
  );
}

/* A voice note: play and pause with the sign-in, a progress line and the length. */
function VoiceNote({ message, mine, token }: { message: Message; mine: boolean; token: string | null }) {
  const player = useRef<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => () => player.current?.remove(), []);
  const toggle = () => {
    if (!player.current) {
      const audio = createAudioPlayer({ uri: chatFileUrl(message.id), headers: { authorization: `Bearer ${token ?? ""}` } });
      audio.addListener("playbackStatusUpdate", status => {
        setProgress(status.duration ? status.currentTime / status.duration : 0);
        if (status.didJustFinish) {
          setPlaying(false);
          setProgress(0);
          void audio.seekTo(0);
        }
      });
      player.current = audio;
    }
    if (playing) player.current.pause();
    else player.current.play();
    setPlaying(!playing);
  };
  return (
    <View style={styles.voice}>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause voice note" : "Play voice note"} onPress={toggle} style={[styles.play, { backgroundColor: mine ? "rgba(255,255,255,0.22)" : colors.brand }]}>
        <Icon name={playing ? "pause" : "play"} size={16} color="#ffffff" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={[styles.track, { backgroundColor: mine ? "rgba(255,255,255,0.25)" : "#e3e6dd" }]}>
          <View style={[styles.fill, { width: `${Math.min(100, progress * 100)}%`, backgroundColor: mine ? colors.lime : colors.brand }]} />
        </View>
        <T size={11} color={mine ? "rgba(255,255,255,0.75)" : colors.mute} style={{ marginTop: 4 }}>
          {durationText(message.attachment?.durationMs)}
        </T>
      </View>
    </View>
  );
}

export function ChatBubble({
  message,
  mine,
  group,
  showSender,
  zone,
  token,
  onLongPress,
  onOpenImage,
  onOpenFile,
  onJump,
  onReact,
  highlighted,
}: {
  message: Message;
  mine: boolean;
  group: boolean;
  showSender: boolean;
  zone?: string;
  token: string | null;
  onLongPress: (message: Message) => void;
  onOpenImage: (message: Message) => void;
  onOpenFile: (message: Message) => void;
  onJump: (messageId: string) => void;
  onReact: (message: Message, emoji: string | null) => void;
  highlighted: boolean;
}) {
  if (message.kind === "system") {
    return (
      <View style={styles.systemRow}>
        <View style={styles.system}>
          <T size={12} color={colors.mute} style={{ textAlign: "center" }}>
            {message.body}
          </T>
        </View>
      </View>
    );
  }
  const ink = mine ? "#ffffff" : colors.ink;
  const soft = mine ? "rgba(255,255,255,0.75)" : colors.mute;
  const image = message.kind === "image" && message.attachment && !message.deleted;
  return (
    <View style={[styles.row, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
      <View style={{ maxWidth: "82%", alignItems: mine ? "flex-end" : "flex-start" }}>
        <Pressable
          onLongPress={() => !message.deleted && onLongPress(message)}
          delayLongPress={250}
          accessibilityHint="Long press for reactions, reply and more"
          style={[styles.bubble, mine ? styles.mine : styles.theirs, image && !message.body && { padding: 4 }, highlighted && styles.highlight]}
        >
          {showSender && group && !mine ? (
            <T size={12.5} weight="bold" color={colorFor(message.sender?.id ?? "")} style={{ marginBottom: 2 }}>
              {message.sender?.name ?? "Former colleague"}
            </T>
          ) : null}
          {message.forwarded && !message.deleted ? (
            <View style={styles.inline}>
              <Icon name="corner-up-right" size={12} color={soft} />
              <T size={12} color={soft} style={{ fontStyle: "italic" }}>
                Forwarded
              </T>
            </View>
          ) : null}
          {message.replyTo && !message.deleted ? (
            <Pressable onPress={() => onJump(message.replyTo!.id)} style={[styles.quote, { borderLeftColor: mine ? colors.lime : colors.brand, backgroundColor: mine ? "rgba(255,255,255,0.13)" : "#f0f3ec" }]}>
              <T size={12.5} weight="bold" color={mine ? colors.lime : colors.brand}>
                {message.replyTo.senderName ?? "Message"}
              </T>
              <T size={12.5} color={soft} numberOfLines={2}>
                {message.replyTo.deleted ? "Deleted message" : previewOf(message.replyTo.kind, message.replyTo.body)}
              </T>
            </Pressable>
          ) : null}
          {message.deleted ? (
            <T size={15} color={soft} style={{ fontStyle: "italic" }}>
              This message was deleted
            </T>
          ) : (
            <>
              {image ? (
                <Pressable onPress={() => onOpenImage(message)} accessibilityRole="imagebutton" accessibilityLabel="Open photo">
                  <AuthImage url={chatFileUrl(message.id)} token={token} label={message.attachment!.name} style={styles.image} />
                </Pressable>
              ) : null}
              {message.kind === "file" && message.attachment ? (
                <Pressable onPress={() => onOpenFile(message)} style={[styles.file, { backgroundColor: mine ? "rgba(255,255,255,0.13)" : "#f0f3ec" }]}>
                  <View style={[styles.fileIcon, { backgroundColor: mine ? "rgba(255,255,255,0.2)" : "#ffffff" }]}>
                    <Icon name="file-text" size={20} color={ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T size={14} weight="semibold" color={ink} numberOfLines={1}>
                      {message.attachment.name}
                    </T>
                    <T size={12} color={soft}>
                      {sizeText(message.attachment.size)} · tap to open
                    </T>
                  </View>
                </Pressable>
              ) : null}
              {message.kind === "voice" && message.attachment ? <VoiceNote message={message} mine={mine} token={token} /> : null}
              {message.person ? (
                <View style={[styles.person, { backgroundColor: mine ? "rgba(255,255,255,0.18)" : colors.sky }]}>
                  <Icon name="user" size={12} color={mine ? "#ffffff" : colors.skyInk} />
                  <T size={12} weight="semibold" color={mine ? "#ffffff" : colors.skyInk}>
                    {message.person.name}
                  </T>
                </View>
              ) : null}
              {message.body ? (
                <T size={15.5} color={ink} style={[{ lineHeight: 21 }, image ? { paddingHorizontal: 6, paddingTop: 6 } : null]}>
                  {message.body}
                </T>
              ) : null}
            </>
          )}
          <View style={[styles.meta, image && !message.body && styles.metaOnImage]}>
            {message.starred ? <Icon name="star" size={11} color={image && !message.body ? "#ffffff" : soft} /> : null}
            {message.editedAt && !message.deleted ? (
              <T size={11} color={soft}>
                edited
              </T>
            ) : null}
            <T size={11} color={image && !message.body ? "#ffffff" : soft}>
              {fmt.time(message.at, zone)}
            </T>
            {mine && !message.deleted ? <Ticks status={message.status} color={message.status === "read" ? colors.lime : image && !message.body ? "#ffffff" : soft} /> : null}
          </View>
        </Pressable>
        {message.reactions.length ? (
          <View style={[styles.reactions, { alignSelf: mine ? "flex-end" : "flex-start" }]}>
            {message.reactions.map(reaction => (
              <Pressable key={reaction.emoji} onPress={() => onReact(message, reaction.mine ? null : reaction.emoji)} style={[styles.reaction, reaction.mine && { borderColor: colors.sage }]}>
                <T size={13}>{reaction.emoji}</T>
                {reaction.count > 1 ? (
                  <T size={11} color={colors.mute}>
                    {reaction.count}
                  </T>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 10, marginVertical: 2 },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, minWidth: 74 },
  mine: { backgroundColor: "#24604d", borderBottomRightRadius: 6 },
  theirs: { backgroundColor: "#ffffff", borderBottomLeftRadius: 6 },
  highlight: { borderWidth: 2, borderColor: colors.lime },
  inline: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 5 },
  image: { width: 230, height: 230, borderRadius: 14 },
  file: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 8, marginBottom: 4, width: 240 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  voice: { flexDirection: "row", alignItems: "center", gap: 10, width: 220, paddingVertical: 2 },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  track: { height: 5, borderRadius: 3, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
  person: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 2 },
  metaOnImage: { position: "absolute", right: 10, bottom: 10, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  reactions: { flexDirection: "row", gap: 4, marginTop: -6, marginHorizontal: 8 },
  reaction: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#ffffff", borderRadius: 999, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 6, paddingVertical: 2 },
  systemRow: { alignItems: "center", marginVertical: 6 },
  system: { backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, maxWidth: "85%" },
});
