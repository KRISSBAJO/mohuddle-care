import { StyleSheet, View } from "react-native";
import { colorFor, initialsOf } from "@/lib/chat";
import { colors } from "@/lib/theme";
import { Icon, T } from "./ui";

/* The avatar for a chat: initials in a colour, or an icon for home groups and Announcements. */
export function ChatAvatar({ chat, size = 50, online }: { chat: { id: string; kind: string; title: string }; size?: number; online?: boolean }) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: chat.kind === "announcements" ? "#c27c0e" : colorFor(chat.id) }]}>
        {chat.kind === "announcements" ? (
          <Icon name="volume-2" size={size * 0.42} color="#ffffff" />
        ) : chat.kind === "home" ? (
          <Icon name="users" size={size * 0.42} color="#ffffff" />
        ) : (
          <T weight="bold" size={size * 0.36} color="#ffffff">
            {initialsOf(chat.title)}
          </T>
        )}
      </View>
      {online ? <View style={[styles.online, { right: size * 0.02, bottom: size * 0.02 }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  online: { position: "absolute", width: 13, height: 13, borderRadius: 7, backgroundColor: "#2bb673", borderWidth: 2, borderColor: colors.ground },
});
