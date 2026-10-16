import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText, Icon, T, type IconName } from "@/components/ui";
import { ApiError, type Today } from "@/lib/api";
import { duration, fmt } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

type Row = { key: string; icon: IconName; tint: { bg: string; fg: string }; title: string; detail: string; late?: boolean; side?: string; href?: string };

const TINTS = {
  dose: { bg: "#fdf0dc", fg: "#9a6212" },
  note: { bg: "#e4eef8", fg: "#1f4f7a" },
  task: { bg: "#e3f1e8", fg: "#2f7d5b" },
  handover: { bg: "#efe8fa", fg: "#5b3f9a" },
};
const AVATARS = [
  { bg: "#ece6f8", fg: "#5b3f9a" },
  { bg: "#dff1ee", fg: "#21665c" },
  { bg: "#fbe6d9", fg: "#8a4318" },
  { bg: "#e3eef7", fg: "#1f4f7a" },
];

/* The staff member's day: their shift, what is due and who is there. */
export default function TodayScreen() {
  const { call, me } = useSession();
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const zone = me?.agency?.zone;

  const load = useCallback(
    () =>
      call<Today>("/today").then(
        data => {
          setToday(data);
          setError("");
        },
        problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
      ),
    [call],
  );

  useEffect(() => {
    // The first load happens when the screen comes into focus, below. The time on shift counts up; the list refreshes every few minutes.
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(() => void load(), 3 * 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
    };
  }, [load]);

  // Back from the clock screen: show the new state straight away.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const [breakChoice, setBreakChoice] = useState(false);
  const [breakBusy, setBreakBusy] = useState(false);
  async function takeBreak(body: { action: "start"; kind: "meal" | "rest" } | { action: "end" }) {
    setBreakBusy(true);
    setBreakChoice(false);
    try {
      await call("/clock/break", body);
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBreakBusy(false);
    }
  }

  async function pullToRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const first = me?.user.name.split(" ")[0] ?? "";
  const initials = (me?.user.name ?? "")
    .split(" ")
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // What is due, in one list.
  const rows: Row[] = [];
  for (const round of today?.doseRounds ?? []) {
    rows.push({
      key: `dose-${round.at}`,
      icon: "droplet",
      tint: TINTS.dose,
      title: "Medicines",
      detail: `${round.doses} ${round.doses === 1 ? "dose" : "doses"} for ${round.people} ${round.people === 1 ? "person" : "people"}`,
      late: round.late,
      side: fmt.time(round.at, zone),
      href: "/meds",
    });
  }
  if (today?.notes?.missing) {
    rows.push({
      key: "notes",
      icon: "edit-3",
      tint: TINTS.note,
      title: `${today.notes.missing} shift ${today.notes.missing === 1 ? "note" : "notes"} to write`,
      detail: today.notes.overdue ? `${today.notes.overdue} past the deadline` : "From your recent shifts",
      late: Boolean(today.notes.overdue),
      href: "/notes",
    });
  }
  if (today?.handovers) {
    rows.push({ key: "handovers", icon: "message-circle", tint: TINTS.handover, title: `${today.handovers} ${today.handovers === 1 ? "handover" : "handovers"} to read`, detail: "From the last shift here" });
  }
  for (const task of today?.tasks ?? []) {
    const overdue = task.dueAt ? new Date(task.dueAt).getTime() < now : false;
    rows.push({
      key: `task-${task.id}`,
      icon: "check",
      tint: TINTS.task,
      title: task.title,
      detail: task.dueAt ? `${overdue ? "Was due" : "Due"} ${fmt.dayShort(task.dueAt, zone)}` : "Task",
      late: overdue,
      side: task.dueAt ? fmt.time(task.dueAt, zone) : undefined,
      href: `/task?id=${task.id}`,
    });
  }
  const lateCount = rows.filter(row => row.late).length;
  const doses = (today?.doseRounds ?? []).reduce((sum, round) => sum + round.doses, 0);

  // The shift card.
  const clock = today?.clock;
  const shiftStart = clock?.state === "on" ? clock.since : clock?.shift?.startsAt;
  const shiftEnd = clock?.state === "on" ? clock.shiftEndsAt : clock?.shift?.endsAt;
  const where = clock?.state === "on" ? clock.home : (clock?.shift?.home ?? clock?.next?.home);
  const progress = shiftStart && shiftEnd ? Math.min(1, Math.max(0, (now - new Date(shiftStart).getTime()) / (new Date(shiftEnd).getTime() - new Date(shiftStart).getTime()))) : 0;
  const status =
    clock?.state === "on"
      ? { words: clock.onBreak ? "On a break" : "On shift", bg: colors.sageSoft, fg: colors.sage }
      : clock?.shift
        ? { words: "Not clocked in", bg: "#fdf0dc", fg: "#9a6212" }
        : { words: "Off today", bg: "#eef0ec", fg: colors.mute };

  // Three small counts along the bottom of the shift card.
  const counts = [
    { label: doses === 1 ? "dose due" : "doses due", value: doses, alert: (today?.doseRounds ?? []).some(round => round.late) },
    { label: today?.notes?.missing === 1 ? "note" : "notes", value: today?.notes?.missing ?? 0, alert: Boolean(today?.notes?.overdue) },
    { label: today?.tasks.length === 1 ? "task" : "tasks", value: today?.tasks.length ?? 0, alert: (today?.tasks ?? []).some(task => task.dueAt && new Date(task.dueAt).getTime() < now) },
  ];
  const summary = (
    <View style={styles.summary}>
      {counts.map((count, index) => (
        <Fragment key={count.label}>
          {index > 0 ? <View style={styles.summaryRule} /> : null}
          <View style={styles.summaryItem}>
            <T weight="heavy" size={17} color={count.alert ? colors.flag : colors.ink} style={{ letterSpacing: -0.4 }}>
              {count.value}
            </T>
            <T weight="medium" size={13} color={colors.mute}>
              {count.label}
            </T>
          </View>
        </Fragment>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={colors.brand} />} showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={["top"]} style={styles.header}>
          <View style={styles.topRow}>
            <View style={[styles.agency, shadow.soft]}>
              <View style={styles.agencyDot} />
              <T weight="semibold" size={13} color={colors.brand}>
                {me?.agency?.name ?? "Mohuddle"}
              </T>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Your account" onPress={() => router.push("/more")} style={styles.me}>
              <T weight="bold" size={14} color={colors.lime}>
                {initials}
              </T>
            </Pressable>
          </View>
          <T weight="medium" size={13} color={colors.mute} style={{ marginTop: 22 }}>
            {fmt.dayLong(new Date(now), zone)}
          </T>
          <T weight="bold" size={24} style={{ letterSpacing: -0.6, lineHeight: 30, marginTop: 2 }}>
            Hey {first}
          </T>
        </SafeAreaView>

        {me?.user.isStaff && clock ? (
          <View style={[styles.shift, shadow.soft]}>
            <View style={styles.shiftTop}>
              <T weight="semibold" size={12} color={colors.mute} style={{ letterSpacing: 1 }}>
                {clock.state === "on" ? "ON THE CLOCK" : clock.shift ? "TODAY'S SHIFT" : "NEXT SHIFT"}
              </T>
              <View style={[styles.chip, { backgroundColor: status.bg }]}>
                <View style={[styles.chipDot, { backgroundColor: status.fg }]} />
                <T weight="semibold" size={12} color={status.fg}>
                  {status.words}
                </T>
              </View>
            </View>
            <T weight="semibold" size={20} style={styles.big}>
              {clock.state === "on"
                ? `On for ${duration(clock.since, now)}`
                : clock.shift
                  ? `${fmt.time(clock.shift.startsAt, zone)} – ${fmt.time(clock.shift.endsAt, zone)}`
                  : clock.next
                    ? `${fmt.dayShort(clock.next.startsAt, zone)}, ${fmt.time(clock.next.startsAt, zone)}`
                    : "Nothing scheduled"}
            </T>
            {where ? (
              <View style={styles.place}>
                <Icon name="map-pin" size={13} color={colors.sage} />
                <T size={13} color={colors.mute}>
                  {where}
                  {shiftStart && shiftEnd && clock.state === "off" ? `  ·  ${duration(shiftStart, new Date(shiftEnd).getTime())} shift` : ""}
                </T>
              </View>
            ) : null}
            {shiftStart && shiftEnd ? (
              <View style={{ marginTop: 18 }}>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(3, progress * 100)}%` }]} />
                </View>
                <View style={styles.trackLabels}>
                  <T size={12} color={colors.dim}>
                    {fmt.time(shiftStart, zone)}
                  </T>
                  <T size={12} color={colors.dim}>
                    {fmt.time(shiftEnd, zone)}
                  </T>
                </View>
              </View>
            ) : null}
            {clock.state === "on" ? (
              <View style={styles.actions}>
                <Button label="Clock out" icon="log-out" onPress={() => router.push("/clock")} style={{ flex: 1 }} />
                {clock.onBreak ? (
                  <Button label="End break" tone="lime" icon="coffee" busy={breakBusy} onPress={() => takeBreak({ action: "end" })} style={{ flex: 1 }} />
                ) : (
                  <Button label="Break" tone="ghost" icon="coffee" busy={breakBusy} onPress={() => setBreakChoice(!breakChoice)} style={{ flex: 1 }} />
                )}
              </View>
            ) : clock.shift ? (
              <Button label="Clock in" icon="log-in" onPress={() => router.push("/clock")} style={styles.actions} />
            ) : (
              <Button label="Clock in without a shift" tone="ghost" icon="log-in" onPress={() => router.push("/clock")} style={styles.actions} />
            )}
            {breakChoice ? (
              <View style={[styles.actions, { marginTop: 8 }]}>
                <Button label="Meal break" tone="ghost" onPress={() => takeBreak({ action: "start", kind: "meal" })} style={{ flex: 1 }} />
                <Button label="Rest break" tone="ghost" onPress={() => takeBreak({ action: "start", kind: "rest" })} style={{ flex: 1 }} />
              </View>
            ) : null}
            {today ? <View style={styles.summaryInCard}>{summary}</View> : null}
          </View>
        ) : null}

        {!(me?.user.isStaff && clock) && today ? <View style={[styles.summaryCard, shadow.soft]}>{summary}</View> : null}

        {me?.readOnly ? (
          <View style={styles.notice}>
            <ErrorText>This agency&apos;s Mohuddle subscription has lapsed. You can look, but nothing can be changed. Ask your office.</ErrorText>
          </View>
        ) : null}
        {error ? (
          <View style={styles.notice}>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : null}

        <View style={styles.sectionHead}>
          <T weight="bold" size={20} style={{ letterSpacing: -0.6 }}>
            Due now
          </T>
          {lateCount ? (
            <View style={styles.latePill}>
              <T weight="semibold" size={12} color={colors.flag}>
                {lateCount} late
              </T>
            </View>
          ) : null}
        </View>
        {today && rows.length === 0 ? (
          <View style={[styles.group, styles.empty, shadow.soft]}>
            <View style={[styles.rowIcon, { backgroundColor: colors.sageSoft }]}>
              <Icon name="check" size={18} color={colors.sage} />
            </View>
            <T weight="semibold" style={{ marginTop: 10 }}>
              All caught up
            </T>
            <T size={13} color={colors.mute} style={{ textAlign: "center" }}>
              Medicines, notes and tasks show here when they are due.
            </T>
          </View>
        ) : (
          <View style={[styles.group, shadow.soft]}>
            {rows.map((row, index) => (
              <Fragment key={row.key}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable disabled={!row.href} onPress={() => row.href && router.push(row.href)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                  <View style={[styles.rowIcon, { backgroundColor: row.tint.bg }]}>
                    <Icon name={row.icon} size={17} color={row.tint.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T weight="semibold" size={15} numberOfLines={1}>
                      {row.title}
                    </T>
                    <T size={13} color={colors.mute} numberOfLines={1}>
                      {row.detail}
                    </T>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    {row.side ? (
                      <T weight="semibold" size={13} color={row.late ? colors.flag : colors.ink}>
                        {row.side}
                      </T>
                    ) : null}
                    {row.late ? (
                      <View style={styles.lateTag}>
                        <T weight="semibold" size={11} color={colors.flag}>
                          Late
                        </T>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              </Fragment>
            ))}
          </View>
        )}

        {today?.people.length ? (
          <>
            <View style={styles.sectionHead}>
              <T weight="bold" size={20} style={{ letterSpacing: -0.6 }}>
                At {today.home?.name}
              </T>
              <T size={13} color={colors.mute}>
                {today.people.length} {today.people.length === 1 ? "person" : "people"}
              </T>
            </View>
            <View style={[styles.peopleCard, shadow.soft]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleRow}>
                {today.people.map((person, index) => {
                  const tone = AVATARS[index % AVATARS.length];
                  const ring = person.doseLate ? colors.flag : person.dosesDue ? "#e0a43a" : "transparent";
                  return (
                    <Pressable key={person.id} accessibilityRole="button" onPress={() => router.push(`/person?id=${person.id}`)} style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]} accessibilityLabel={`${person.name}${person.dosesDue ? `, ${person.dosesDue} doses due${person.doseLate ? ", late" : ""}` : ""}`}>
                      <View style={[styles.ring, { borderColor: ring }]}>
                        <View style={[styles.avatar, { backgroundColor: tone.bg }]}>
                          <T weight="bold" size={17} color={tone.fg}>
                            {person.initials}
                          </T>
                        </View>
                        {person.dosesDue ? (
                          <View style={[styles.badge, { backgroundColor: person.doseLate ? colors.flag : "#e0a43a" }]}>
                            <T weight="bold" size={11} color="#ffffff">
                              {person.dosesDue}
                            </T>
                          </View>
                        ) : null}
                      </View>
                      <T weight="semibold" size={14} numberOfLines={1} style={{ marginTop: 8 }}>
                        {person.name.split(" ")[0]}
                      </T>
                      <T size={12} color={person.doseLate ? colors.flag : colors.mute} numberOfLines={1}>
                        {person.dosesDue ? `${person.dosesDue} ${person.dosesDue === 1 ? "dose" : "doses"}${person.doseLate ? " late" : ""}` : "Nothing due"}
                      </T>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  agency: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13 },
  agencyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sage },
  me: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  shift: { marginHorizontal: 20, backgroundColor: colors.card, borderRadius: 28, padding: 20 },
  shiftTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  big: { marginTop: 12, letterSpacing: -0.3, lineHeight: 26 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  place: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: "#eef0ec", overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.sage },
  trackLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  summary: { flexDirection: "row", alignItems: "center" },
  summaryItem: { flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 5 },
  summaryRule: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: colors.line },
  summaryInCard: { marginTop: 16, marginHorizontal: -20, marginBottom: -20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: "#fafbf8", borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  summaryCard: { marginHorizontal: 20, backgroundColor: colors.card, borderRadius: 20, paddingVertical: 14 },
  notice: { marginHorizontal: 20, marginTop: 14 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, marginTop: 28, marginBottom: 12 },
  latePill: { backgroundColor: colors.flagSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  group: { marginHorizontal: 20, backgroundColor: colors.card, borderRadius: 24, overflow: "hidden" },
  empty: { alignItems: "center", paddingVertical: 26, paddingHorizontal: 24 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 68 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  lateTag: { backgroundColor: colors.flagSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  peopleCard: { marginHorizontal: 20, backgroundColor: colors.card, borderRadius: 24 },
  peopleRow: { paddingHorizontal: 8, paddingVertical: 18, minWidth: "100%", justifyContent: "space-around" },
  person: { width: 82, alignItems: "center" },
  ring: { width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.card },
});
