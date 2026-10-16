import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Fragment, useCallback, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText, Icon, T, type IconName } from "@/components/ui";
import { ApiError, type TeamNow } from "@/lib/api";
import { duration, whenText } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

const NEEDS: Record<TeamNow["needs"][number]["kind"], { icon: IconName; bg: string; fg: string; label: string; when: string }> = {
  no_show: { icon: "user-x", bg: colors.flagSoft, fg: colors.flag, label: "Not clocked in", when: "started" },
  late: { icon: "clock", bg: colors.amberSoft, fg: colors.amber, label: "Late", when: "started" },
  forgot_out: { icon: "log-out", bg: colors.flagSoft, fg: colors.flag, label: "May have forgotten to clock out", when: "ended" },
  away: { icon: "map-pin", bg: colors.amberSoft, fg: colors.amber, label: "Clocked in away from the home", when: "clocked in" },
};
const SEVERITY: Record<string, string> = { low: colors.sage, moderate: "#c48a1a", high: colors.flag, critical: colors.flag };

/*
 * The manager's Team tab: who needs a call now, what is waiting for a decision, who is on shift at
 * each home, and incidents nobody has started reviewing. The same numbers as the website's Time page.
 */
export default function TeamScreen() {
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [team, setTeam] = useState<TeamNow | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      call<TeamNow>("/team").then(
        data => {
          setTeam(data);
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
  async function pullToRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const waiting = team ? team.waiting.timeOff + team.waiting.corrections + team.waiting.punches + team.waiting.timesheets : 0;
  const parts = team
    ? ([
        [team.waiting.timeOff, "time off"],
        [team.waiting.corrections, team.waiting.corrections === 1 ? "punch fix" : "punch fixes"],
        [team.waiting.timesheets, team.waiting.timesheets === 1 ? "timesheet" : "timesheets"],
        [team.waiting.punches, team.waiting.punches === 1 ? "flagged punch" : "flagged punches"],
      ] as const).filter(([count]) => count > 0)
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={colors.brand} />} showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={["top"]} style={styles.header}>
          <T weight="medium" size={13} color={colors.mute} style={{ marginTop: 8 }}>
            {me?.agency?.name}
          </T>
          <T weight="bold" size={24} style={{ letterSpacing: -0.6, lineHeight: 30, marginTop: 2 }}>
            Your team
          </T>
          {team ? (
            <View style={styles.pulse}>
              <Stat value={team.onClock} label="on the clock" />
              <View style={styles.rule} />
              <Stat value={team.onBreak} label="on a break" />
              <View style={styles.rule} />
              <Stat value={team.needs.length} label="need you" tone={team.needs.length ? colors.flag : undefined} />
            </View>
          ) : null}
        </SafeAreaView>

        <View style={{ paddingHorizontal: 20 }}>
          <ErrorText>{error}</ErrorText>
        </View>

        {team ? (
          <Pressable accessibilityRole="button" onPress={() => router.push("/approvals")} style={({ pressed }) => [styles.waiting, shadow.soft, pressed && { opacity: 0.8 }]}>
            <View style={[styles.rowIcon, { backgroundColor: waiting ? colors.lime : colors.sageSoft }]}>
              <Icon name={waiting ? "inbox" : "check"} size={18} color={waiting ? colors.brand : colors.sage} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="bold" size={16}>
                {waiting ? `${waiting} waiting for you` : "Nothing to approve"}
              </T>
              <T size={13} color={colors.mute} numberOfLines={2}>
                {parts.length ? parts.map(([count, words]) => `${count} ${words}`).join(" · ") : "Time off, punch fixes and timesheets show here."}
              </T>
            </View>
            <Icon name="chevron-right" size={18} color={colors.dim} />
          </Pressable>
        ) : null}

        {team?.needs.length ? (
          <>
            <Head title="Needs you now" count={team.needs.length} tone="flag" />
            <View style={[styles.group, shadow.soft]}>
              {team.needs.map((need, index) => {
                const look = NEEDS[need.kind];
                return (
                  <Fragment key={need.key}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.row}>
                      <View style={[styles.rowIcon, { backgroundColor: look.bg }]}>
                        <Icon name={look.icon} size={17} color={look.fg} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <T weight="semibold" size={15} numberOfLines={1}>
                          {need.staff}
                        </T>
                        <T weight="semibold" size={13} color={look.fg}>
                          {look.label}
                        </T>
                        <T size={12} color={colors.mute} numberOfLines={1}>
                          {need.home} · {look.when} {whenText(need.at, zone)}
                        </T>
                      </View>
                      {need.phone ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Call ${need.staff}`} onPress={() => Linking.openURL(`tel:${need.phone.replace(/[^\d+]/g, "")}`)} style={styles.call}>
                          <Icon name="phone" size={16} color={colors.brand} />
                        </Pressable>
                      ) : null}
                    </View>
                  </Fragment>
                );
              })}
            </View>
          </>
        ) : null}

        {team?.incidents.length ? (
          <>
            <Head title="New incidents" count={team.incidents.length} tone={team.incidents.some(item => item.overdue) ? "flag" : undefined} />
            <View style={[styles.group, shadow.soft]}>
              {team.incidents.map((incident, index) => {
                const overdue = incident.overdue;
                return (
                  <Fragment key={incident.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <Pressable accessibilityRole="button" onPress={() => router.push(`/incident?id=${incident.id}`)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                      <View style={[styles.rowIcon, { backgroundColor: colors.flagSoft }]}>
                        <Icon name="alert-triangle" size={17} color={SEVERITY[incident.severity] ?? colors.flag} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <T weight="semibold" size={15} numberOfLines={1}>
                          {incident.person ?? incident.home ?? "No person named"}
                        </T>
                        <T size={13} numberOfLines={2}>
                          {incident.category}
                        </T>
                        <T size={12} color={colors.mute} numberOfLines={1}>
                          {incident.severityLabel} · {incident.person ? `${incident.home ?? "No home"} · ` : ""}
                          {whenText(incident.occurredAt, zone)}
                        </T>
                        {incident.deadline ? (
                          <T size={12} weight="semibold" color={overdue ? colors.flag : colors.amber}>
                            {overdue ? "State report overdue" : `Report to the state by ${whenText(incident.deadline, zone)}`}
                          </T>
                        ) : null}
                      </View>
                      <Icon name="chevron-right" size={18} color={colors.dim} />
                    </Pressable>
                  </Fragment>
                );
              })}
            </View>
          </>
        ) : null}

        {team ? (
          <>
            <Head title="On shift now" count={team.onClock} />
            {team.homes.length === 0 ? (
              <View style={[styles.group, styles.empty, shadow.soft]}>
                <T color={colors.mute}>Nobody is on shift right now.</T>
              </View>
            ) : (
              team.homes.map(home => (
                <View key={home.id} style={[styles.group, shadow.soft, { marginBottom: 12 }]}>
                  <View style={styles.homeHead}>
                    <T weight="bold" size={15} style={{ flex: 1 }} numberOfLines={1}>
                      {home.name}
                    </T>
                    <T size={12} color={home.on.length < home.expected ? colors.amber : colors.mute}>
                      {home.on.length} on{home.expected ? ` · ${home.expected} scheduled` : ""}
                    </T>
                  </View>
                  {home.on.length === 0 ? (
                    <T size={13} color={colors.mute} style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                      Nobody clocked in yet.
                    </T>
                  ) : (
                    home.on.map(person => (
                      <View key={person.id} style={styles.person}>
                        <View style={[styles.dot, { backgroundColor: person.onBreak ? colors.amber : colors.sage }]} />
                        <T weight="medium" size={14} style={{ flex: 1 }} numberOfLines={1}>
                          {person.staff}
                        </T>
                        {person.away ? <Tag text="Away" color={colors.amber} bg={colors.amberSoft} /> : null}
                        {person.onBreak ? <Tag text={`${person.onBreak} break`} color={colors.amber} bg={colors.amberSoft} /> : null}
                        <T size={12} color={colors.mute}>
                          {whenText(person.since, zone)} · {duration(person.since)}
                        </T>
                      </View>
                    ))
                  )}
                </View>
              ))
            )}
            {team.reviewing ? (
              <T size={13} color={colors.mute} style={{ paddingHorizontal: 22, marginTop: 6 }}>
                {team.reviewing} {team.reviewing === 1 ? "incident is" : "incidents are"} under review. Follow them on the website.
              </T>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <T weight="bold" size={20} color={tone ?? colors.ink}>
        {value}
      </T>
      <T size={12} color={colors.mute}>
        {label}
      </T>
    </View>
  );
}

function Head({ title, count, tone }: { title: string; count: number; tone?: "flag" }) {
  return (
    <View style={styles.sectionHead}>
      <T weight="bold" size={20} style={{ letterSpacing: -0.6 }}>
        {title}
      </T>
      <View style={[styles.countPill, tone === "flag" && { backgroundColor: colors.flagSoft }]}>
        <T weight="semibold" size={12} color={tone === "flag" ? colors.flag : colors.mute}>
          {count}
        </T>
      </View>
    </View>
  );
}

function Tag({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
      <T weight="semibold" size={11} color={color}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 },
  pulse: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 20, paddingVertical: 12, marginTop: 16 },
  rule: { width: StyleSheet.hairlineWidth, height: 26, backgroundColor: colors.line },
  waiting: { marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 22, padding: 16 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, marginTop: 28, marginBottom: 12 },
  countPill: { backgroundColor: "#eceee8", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  group: { marginHorizontal: 20, backgroundColor: colors.card, borderRadius: 24, overflow: "hidden" },
  empty: { alignItems: "center", paddingVertical: 22 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 68 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  call: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.wash, alignItems: "center", justifyContent: "center" },
  homeHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  person: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
