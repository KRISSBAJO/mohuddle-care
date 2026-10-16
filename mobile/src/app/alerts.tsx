import { router, useFocusEffect } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ScreenBar } from "@/components/ScreenBar";
import { ErrorText, Icon, T, type IconName } from "@/components/ui";
import { API_URL, ApiError, type Alerts } from "@/lib/api";
import { whenText } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

const TONES: Record<Alerts["items"][number]["tone"], { icon: IconName; bg: string; fg: string }> = {
  info: { icon: "bell", bg: colors.sky, fg: colors.skyInk },
  good: { icon: "check", bg: colors.sageSoft, fg: colors.sage },
  warn: { icon: "clock", bg: colors.amberSoft, fg: colors.amber },
  bad: { icon: "alert-triangle", bg: colors.flagSoft, fg: colors.flag },
};

/*
 * The phone's Alerts: the same messages as the bell on the website. Notifications on the lock screen
 * may only say "You have a new alert"; this is where the detail is. Tapping one opens its screen.
 */
export default function AlertsScreen() {
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      call<Alerts>("/notifications").then(
        data => {
          setAlerts(data);
          setError("");
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

  async function open(item: Alerts["items"][number]) {
    if (!item.read) {
      setAlerts(current => (current ? { unread: Math.max(0, current.unread - 1), items: current.items.map(entry => (entry.id === item.id ? { ...entry, read: true } : entry)) } : current));
      call("/notifications/read", { id: item.id }).catch(() => undefined);
    }
    if (item.screen) router.push(item.screen as never);
    else if (item.web) void Linking.openURL(`${API_URL}${item.web}`);
  }

  async function readAll() {
    await call("/notifications/read", {}).catch(() => undefined);
    await load();
  }

  return (
    <View style={styles.page}>
      <ScreenBar
        title="Alerts"
        right={
          alerts?.unread ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Mark all as read" onPress={readAll} style={styles.allRead}>
              <Icon name="check-square" size={18} color={colors.brand} />
            </Pressable>
          ) : null
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
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
      >
        <ErrorText>{error}</ErrorText>
        {!alerts && !error ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : null}
        {alerts && !alerts.items.length ? (
          <View style={[styles.group, styles.empty, shadow.soft]}>
            <Icon name="bell" size={24} color={colors.sage} />
            <T weight="semibold">No alerts yet</T>
            <T size={13} color={colors.mute} style={{ textAlign: "center" }}>
              Reminders, approvals and anything that needs you show here.
            </T>
          </View>
        ) : null}
        {alerts?.items.length ? (
          <View style={[styles.group, shadow.soft]}>
            {alerts.items.map((item, index) => {
              const tone = TONES[item.tone] ?? TONES.info;
              return (
                <Fragment key={item.id}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`${item.read ? "" : "Unread. "}${item.title}`} onPress={() => open(item)} style={({ pressed }) => [styles.row, !item.read && styles.unread, pressed && { opacity: 0.7 }]}>
                    <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                      <Icon name={tone.icon} size={16} color={tone.fg} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T weight={item.read ? "medium" : "bold"} size={15}>
                        {item.title}
                      </T>
                      {item.body ? (
                        <T size={13} color={colors.mute} numberOfLines={3}>
                          {item.body}
                        </T>
                      ) : null}
                      <T size={12} color={colors.dim}>
                        {whenText(item.at, zone)}
                        {!item.screen && item.web ? " · opens on the website" : ""}
                      </T>
                    </View>
                    {!item.read ? <View style={styles.dot} /> : null}
                  </Pressable>
                </Fragment>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  scroll: { padding: 20, paddingTop: 8, paddingBottom: 48, gap: 12 },
  allRead: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  group: { backgroundColor: colors.card, borderRadius: 24, overflow: "hidden" },
  empty: { alignItems: "center", gap: 6, paddingVertical: 28, paddingHorizontal: 24 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  unread: { backgroundColor: "#fbfdf6" },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.sage, marginTop: 6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 64 },
});
