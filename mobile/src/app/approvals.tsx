import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ScreenBar } from "@/components/ScreenBar";
import { Button, Check, ErrorText, Icon, T } from "@/components/ui";
import { ApiError, type Approvals } from "@/lib/api";
import { daysText, fmt, hoursText, whenText } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, fonts, shadow } from "@/lib/theme";

type Call = <R>(path: string, body?: unknown) => Promise<R>;

/*
 * Everything waiting for a manager: time off, punch fixes, signed timesheets and flagged punches. Each
 * decision goes through the same server rules as the website's Time page; a decline needs a reason.
 */
export default function ApprovalsScreen() {
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [data, setData] = useState<Approvals | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      call<Approvals>("/team/approvals").then(
        result => {
          setData(result);
          setDone({});
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
  const finish = (key: string, words: string) => setDone(current => ({ ...current, [key]: words }));

  const empty = data && !data.timeOff.length && !data.corrections.length && !data.timesheets.length && !data.punches.length;
  return (
    <View style={styles.page}>
      <ScreenBar title="Waiting for you" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={colors.brand} />}>
          <ErrorText>{error}</ErrorText>
          {!data && !error ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : null}
          {empty ? (
            <View style={[styles.card, { alignItems: "center", gap: 8 }, shadow.soft]}>
              <Icon name="check-circle" size={26} color={colors.sage} />
              <T weight="bold" size={17}>
                All decided
              </T>
              <T color={colors.mute} style={{ textAlign: "center" }}>
                Time off, punch fixes and timesheets show here when someone sends one.
              </T>
            </View>
          ) : null}

          {data?.timeOff.length ? <Heading title="Time off" count={data.timeOff.length} /> : null}
          {data?.timeOff.map(item => (
            <Decision
              key={item.id}
              done={done[`off-${item.id}`]}
              title={item.staff}
              tags={[item.type, ...(item.paid ? [] : ["Unpaid"]), ...(item.shortNotice !== null ? [`Short notice: ${item.shortNotice} days`] : [])]}
              lines={[
                `${daysText(item.start, item.end)} · ${hoursText(item.minutes)}`,
                ...(item.reason ? [`“${item.reason}”`] : []),
                ...(item.usesBalance ? [item.balance < item.minutes ? `Leave balance ${hoursText(item.balance)}, short by ${hoursText(item.minutes - item.balance)}` : `Leave balance ${hoursText(item.balance)}`] : []),
                item.shifts ? `${item.shifts} scheduled ${item.shifts === 1 ? "shift" : "shifts"} on those days` : "No scheduled shifts on those days",
              ]}
              options={[
                ...(item.shifts ? [{ key: "openShifts", label: `Put their ${item.shifts} ${item.shifts === 1 ? "shift" : "shifts"} on the open shift list`, initial: true }] : []),
                ...(item.usesBalance && item.balance < item.minutes ? [{ key: "allowNegative", label: "Allow going below zero", initial: false }] : []),
              ]}
              approveLabel="Approve"
              declineLabel="Decline"
              declineNeeds="Say why it is declined. They see this."
              send={(approve, note, options) => call(`/team/time-off/${item.id}`, { approve, note, openShifts: Boolean(options.openShifts), allowNegative: Boolean(options.allowNegative) })}
              onDone={approve => finish(`off-${item.id}`, approve ? "Approved. They have been told." : "Declined. They have been told.")}
            />
          ))}

          {data?.corrections.length ? <Heading title="Punch fixes" count={data.corrections.length} /> : null}
          {data?.corrections.map(item => (
            <Decision
              key={item.id}
              done={done[`fix-${item.id}`]}
              title={item.staff}
              tags={[item.newPunch ? "Missing punch" : "Change times"]}
              lines={[`${item.home ?? "No home"}`, `${whenText(item.clockInAt, zone)} to ${whenText(item.clockOutAt, zone)}`, `“${item.reason}”`, `Asked ${whenText(item.askedAt, zone)}`]}
              options={[]}
              approveLabel="Approve"
              declineLabel="Decline"
              declineNeeds="Say why it is declined. They see this."
              send={(approve, note) => call(`/team/corrections/${item.id}`, { approve, note })}
              onDone={approve => finish(`fix-${item.id}`, approve ? "Approved. The punch is fixed." : "Declined. They have been told.")}
            />
          ))}

          {data?.timesheets.length ? <Heading title="Signed timesheets" count={data.timesheets.length} /> : null}
          {data?.timesheets.map(item => (
            <Decision
              key={`${item.periodId}-${item.staffId}`}
              done={done[`sheet-${item.periodId}-${item.staffId}`]}
              title={item.staff}
              tags={[`${daysText(item.start, item.end)}`]}
              lines={[
                item.totals ? `${hoursText(item.totals.total)} in total${item.totals.overtime ? `, ${hoursText(item.totals.overtime)} overtime` : ""} · ${item.totals.punches} ${item.totals.punches === 1 ? "punch" : "punches"}` : "Totals not recorded",
                ...(item.signedAt ? [`Signed ${whenText(item.signedAt, zone)}`] : []),
              ]}
              options={[]}
              approveLabel="Approve"
              declineLabel="Send back"
              declineNeeds="Say what they need to check."
              send={(approve, note) => call("/team/timesheets", { periodId: item.periodId, staffId: item.staffId, action: approve ? "approve" : "return", note })}
              onDone={approve => finish(`sheet-${item.periodId}-${item.staffId}`, approve ? "Approved." : "Sent back. They have been told.")}
            />
          ))}

          {data?.punches.length ? <Heading title="Flagged punches" count={data.punches.length} /> : null}
          {data?.punches.map(item => (
            <Reviewed
              key={item.id}
              done={done[`punch-${item.id}`]}
              item={item}
              zone={zone}
              call={call}
              onDone={() => finish(`punch-${item.id}`, "Marked as reviewed.")}
            />
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Heading({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.heading}>
      <T weight="bold" size={18} style={{ letterSpacing: -0.4 }}>
        {title}
      </T>
      <T size={13} color={colors.mute}>
        {count}
      </T>
    </View>
  );
}

function Done({ title, words }: { title: string; words: string }) {
  return (
    <View style={[styles.card, styles.doneCard]}>
      <Icon name="check-circle" size={18} color={colors.sage} />
      <T size={14} style={{ flex: 1 }}>
        <T weight="semibold" size={14}>
          {title}:{" "}
        </T>
        {words}
      </T>
    </View>
  );
}

/* One request to approve or turn down. A note goes to the staff member; turning down needs one. */
function Decision({
  title,
  tags,
  lines,
  options,
  approveLabel,
  declineLabel,
  declineNeeds,
  done,
  send,
  onDone,
}: {
  title: string;
  tags: string[];
  lines: string[];
  options: { key: string; label: string; initial: boolean }[];
  approveLabel: string;
  declineLabel: string;
  declineNeeds: string;
  done?: string;
  send: (approve: boolean, note: string, options: Record<string, boolean>) => Promise<unknown>;
  onDone: (approve: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const [ticked, setTicked] = useState<Record<string, boolean>>(() => Object.fromEntries(options.map(option => [option.key, option.initial])));
  const [busy, setBusy] = useState<"" | "approve" | "decline">("");
  const [error, setError] = useState("");

  if (done) return <Done title={title} words={done} />;

  async function decide(approve: boolean) {
    if (!approve && note.trim().length < 3) {
      setError(declineNeeds);
      return;
    }
    setBusy(approve ? "approve" : "decline");
    setError("");
    try {
      await send(approve, note, ticked);
      onDone(approve);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <View style={[styles.card, shadow.soft]}>
      <View style={styles.titleRow}>
        <T weight="bold" size={16} style={{ flexShrink: 1 }}>
          {title}
        </T>
        {tags.map(tag => (
          <View key={tag} style={styles.tag}>
            <T size={12} weight="semibold" color={/short notice/i.test(tag) ? colors.amber : colors.mute}>
              {tag}
            </T>
          </View>
        ))}
      </View>
      {lines.map((line, index) => (
        <T key={index} size={14} color={index === 0 ? colors.ink : colors.mute} weight={index === 0 ? "semibold" : "regular"} style={{ lineHeight: 20 }}>
          {line}
        </T>
      ))}
      {options.map(option => (
        <Check key={option.key} checked={Boolean(ticked[option.key])} onToggle={() => setTicked(current => ({ ...current, [option.key]: !current[option.key] }))}>
          <T size={14}>{option.label}</T>
        </Check>
      ))}
      <TextInput value={note} onChangeText={setNote} placeholder="Note to them (needed to turn it down)" placeholderTextColor={colors.dim} maxLength={500} multiline style={styles.note} accessibilityLabel={`Note to ${title}`} />
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label={declineLabel} tone="ghost" busy={busy === "decline"} disabled={Boolean(busy)} onPress={() => decide(false)} style={{ flex: 1 }} />
        <Button label={approveLabel} icon="check" busy={busy === "approve"} disabled={Boolean(busy)} onPress={() => decide(true)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/* A punch the clock flagged: the manager looks and marks it reviewed. */
function Reviewed({ item, zone, call, done, onDone }: { item: Approvals["punches"][number]; zone?: string; call: Call; done?: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (done) return <Done title={item.staff} words={done} />;

  async function review() {
    setBusy(true);
    setError("");
    try {
      await call(`/team/punches/${item.id}`, {});
      onDone();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, shadow.soft]}>
      <T weight="bold" size={16}>
        {item.staff}
      </T>
      <T size={14} color={colors.mute}>
        {item.home ?? "No home"} · {whenText(item.clockInAt, zone)} to {item.clockOutAt ? fmt.time(item.clockOutAt, zone) : "still on"}
      </T>
      <View style={styles.flags}>
        {item.flags.map(flag => (
          <View key={flag} style={[styles.tag, { backgroundColor: colors.amberSoft }]}>
            <T size={12} weight="semibold" color={colors.amber}>
              {flag}
            </T>
          </View>
        ))}
      </View>
      {item.warnings.map(warning => (
        <T key={warning} size={13} color={colors.mute}>
          {warning}
        </T>
      ))}
      <ErrorText>{error}</ErrorText>
      <Button label="Mark reviewed" tone="ghost" icon="eye" busy={busy} onPress={review} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  scroll: { padding: 20, paddingTop: 8, gap: 12, paddingBottom: 48 },
  heading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 12, paddingHorizontal: 2 },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 8 },
  doneCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.sageSoft },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  tag: { backgroundColor: "#eceee8", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  flags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  note: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, backgroundColor: "#fbfcf9" },
});
