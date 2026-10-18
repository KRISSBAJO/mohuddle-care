import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import type { TeamNow } from "@/lib/api";
import { colors, shadow } from "@/lib/theme";
import { NavigationGroup, NavigationRow } from "./NavigationGroup";
import { Button, ErrorText, Icon, T } from "./ui";

/* Uses the manager-only /team response; a missing response is never shown as an all-clear. */
export function ManagerOverview({ team, error, onRetry }: { team: TeamNow | null; error: string; onRetry: () => void }) {
  const waiting = team ? Object.values(team.waiting).reduce((sum, count) => sum + count, 0) : 0;
  const short = team?.homes.filter(home => home.on.length < home.expected) ?? [];
  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <T weight="bold" size={20}>Team overview</T>
        <Pressable accessibilityRole="link" onPress={() => router.push("/team")} style={styles.link}>
          <T weight="semibold" size={13} color={colors.brand}>View team</T>
          <Icon name="chevron-right" size={16} color={colors.brand} />
        </Pressable>
      </View>
      {error ? <View style={{ gap: 10 }}><ErrorText>{error}</ErrorText><Button label="Retry team overview" tone="ghost" onPress={onRetry} /></View> : null}
      {!team ? (!error ? <T color={colors.mute} accessibilityLiveRegion="polite">Loading team overview…</T> : null) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`${team.onClock} on shift, ${team.onBreak} on break. View team coverage`} onPress={() => router.push("/team")} style={[styles.coverage, shadow.soft]}>
            <View style={styles.coverageTop}>
              <View style={{ flex: 1 }}>
                <T weight="semibold" size={13} color={colors.mute}>ON SHIFT NOW</T>
                <T weight="heavy" size={30} color={colors.brand}>{team.onClock}</T>
                <T size={13} color={colors.mute}>{team.onBreak} on break · {team.homes.length} {team.homes.length === 1 ? "home" : "homes"} with shifts</T>
              </View>
              <View style={styles.icon}><Icon name="users" size={24} color={colors.brand} /></View>
            </View>
            <View style={styles.coverageFoot}>
              <Icon name={short.length ? "alert-circle" : "check-circle"} color={short.length ? colors.amber : colors.sage} size={17} />
              <T size={13} color={short.length ? colors.amber : colors.mute} style={{ flex: 1 }}>
                {short.length ? `${short.length} ${short.length === 1 ? "home needs" : "homes need"} coverage` : team.homes.length ? "Scheduled coverage is in place" : "No shifts scheduled or in progress"}
              </T>
              <Icon name="chevron-right" size={17} color={colors.mute} />
            </View>
          </Pressable>
          <NavigationGroup>
            <NavigationRow label={waiting ? `${waiting} awaiting approval` : "No approvals waiting"} detail="Time off, punch fixes and timesheets" icon="inbox" onPress={() => router.push("/approvals")} />
            <NavigationRow label="Needs attention" detail={`${team.needs.length} staffing ${team.needs.length === 1 ? "alert" : "alerts"} · ${team.incidents.length} new ${team.incidents.length === 1 ? "incident" : "incidents"}`} icon={team.needs.length || team.incidents.length ? "alert-triangle" : "check-circle"} danger={Boolean(team.needs.length || team.incidents.length)} onPress={() => router.push("/team")} />
          </NavigationGroup>
        </>
      )}
      <View style={{ marginTop: 8 }}><NavigationGroup title="Manage your team">
        <NavigationRow label="Schedule and coverage" icon="calendar" onPress={() => router.push("/manager-schedule")} />
        <NavigationRow label="Create and assign tasks" icon="check-square" onPress={() => router.push("/manage-tasks")} />
      </NavigationGroup></View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 20, gap: 12, marginBottom: 20 },
  heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  link: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 3 },
  coverage: { backgroundColor: colors.card, borderRadius: 24, overflow: "hidden" },
  coverageTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20 },
  coverageFoot: { flexDirection: "row", alignItems: "center", gap: 8, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.wash },
});
