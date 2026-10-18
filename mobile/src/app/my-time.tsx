import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chips, ErrorText, Section, T } from "@/components/ui";
import { FormInput as Field } from "@/components/FormInput";
import { ApiError } from "@/lib/api";
import { draftKey } from "@/lib/drafts";
import { fmt } from "@/lib/format";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { useDraft } from "@/lib/use-draft";

type Punch = { id: string; clockInAt: string; clockOutAt: string | null; home: string | null; flags: string[] };
type TimeData = {
  today: string; week: string; homes: { id: string; name: string }[];
  shifts: { id: string; home: string; startsAt: string; endsAt: string; status: string; note: string; pattern: string | null }[];
  punches: Punch[]; corrections: { id: string; clockInAt: string; clockOutAt: string; reason: string; status: string; decisionNote: string }[];
  leave: { balanceMinutes: number; types: string[]; balanceTypes: string[]; noticeDays: number; requests: { id: string; type: string; startDate: string; endDate: string; minutes: number; paid: boolean; reason: string; status: string; decisionNote: string; canCancel: boolean }[] };
  timesheet: { start: string; end: string; status: string; locked: boolean; canSign: boolean; signedName: string; returnNote: string; totals: { regular: number; overtime: number; total: number; timeOff: number; paid: number; open: number }; lines: (Punch & { day: string; minutes: number; mealMinutes: number; regular: number; overtime: number })[]; adjustments: { minutes: number; reason: string }[] };
};
const hours = (minutes: number) => (minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 2 });
const plus = (day: string, amount: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };

export default function MyTimeScreen() {
  const { call, me } = useSession();
  const params = useLocalSearchParams<{ view?: string; period?: string }>();
  const [tab, setTab] = useState(params.view && ["schedule", "punches", "leave", "sheet"].includes(params.view) ? params.view : "schedule");
  const [week, setWeek] = useState("");
  const [period, setPeriod] = useState(params.period ?? "");
  const [loaded, setLoaded] = useState<{ scope: string; data: TimeData } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedName, setSignedName] = useState("");
  const scope = `${me?.agency?.id}.${me?.user.id}.${week}.${period}`;
  const data = loaded?.scope === scope ? loaded.data : null;
  const zone = me?.agency?.zone;
  const draft = useDraft<Record<string, string>>(me?.agency ? draftKey(me.user.id, me.agency.id, "time", "requests") : null);
  const fields = draft.value ?? {};
  const change = (key: string, value: string | string[]) => draft.save({ ...fields, [key]: String(value) });
  const load = useCallback(() => call<TimeData>(`/self-service?${new URLSearchParams({ ...(week ? { week } : {}), ...(period ? { period } : {}) })}`).then(result => { setLoaded({ scope, data: result }); setError(""); }, problem => setError(problem instanceof ApiError ? problem.message : "Could not load your time.")), [call, scope, week, period]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const clock = (at: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
  const day = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  function correct(punch?: Punch) {
    draft.save({ ...fields, entryId: punch?.id ?? "", day: punch ? day(punch.clockInAt) : data?.today ?? "", start: punch ? clock(punch.clockInAt) : "", end: punch?.clockOutAt ? clock(punch.clockOutAt) : "", reason: "", correcting: "yes" });
    setTab("punches");
  }
  async function send(action: "leave" | "cancel_leave" | "correction" | "sign", extra?: Record<string, string>) {
    if (busy || !data) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await draft.flush();
      const body = action === "leave" ? { type: fields.leaveType ?? "", startDate: fields.leaveStart ?? "", endDate: fields.leaveEnd ?? "", hours: fields.leaveHours ?? "", reason: fields.leaveReason ?? "" }
        : action === "sign" ? { start: data.timesheet.start, signedName } : { ...fields, ...extra };
      await call("/self-service", { action, fields: body });
      if (action === "leave") draft.save(Object.fromEntries(Object.entries(fields).filter(([key]) => !key.startsWith("leave"))));
      if (action === "correction") draft.save(Object.fromEntries(Object.entries(fields).filter(([key]) => key.startsWith("leave"))));
      setSignedName(""); setNotice(action === "sign" ? "Timesheet signed." : action === "cancel_leave" ? "Leave request cancelled." : "Request sent to your manager."); await load();
    } catch (problem) { setError(problem instanceof ApiError ? problem.message : "Could not save. Try again."); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}><ScrollView pointerEvents={busy ? "none" : "auto"} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load()} />}>
    <Button label="Back" tone="ghost" onPress={() => goBack()} /><T size={26} weight="bold">My schedule and time</T>
    <Chips options={[["schedule", "Schedule"], ["punches", "Punches"], ["leave", "Time off"], ["sheet", "Timesheet"]]} value={tab} onChange={next => { if (next) setTab(String(next)); }} />
    <ErrorText>{error}</ErrorText>{notice ? <T color={colors.sage} accessibilityLiveRegion="polite">{notice}</T> : null}
    {!data ? <Button label="Try again" tone="ghost" onPress={() => void load()} /> : <>
      {tab === "schedule" ? <>
        <View style={{ flexDirection: "row", gap: 10 }}><Button label="Earlier week" tone="ghost" style={{ flex: 1 }} onPress={() => setWeek(plus(data.week, -7))} /><Button label="Later week" tone="ghost" style={{ flex: 1 }} onPress={() => setWeek(plus(data.week, 7))} /></View>
        <T weight="semibold">Week of {data.week}</T>
        {data.shifts.length ? data.shifts.map(shift => <Section key={shift.id} title={`${fmt.dayShort(shift.startsAt, zone)} · ${shift.home}`}><T>{fmt.time(shift.startsAt, zone)} – {fmt.time(shift.endsAt, zone)}</T><T>{shift.pattern ?? "Custom shift"} · {shift.status}</T>{shift.note ? <T>{shift.note}</T> : null}</Section>) : <T>No shifts scheduled for this week.</T>}
      </> : null}
      {tab === "punches" ? <>
        <Button label="Request a missing punch" disabled={!draft.ready} onPress={() => correct()} />
        {fields.correcting === "yes" && draft.ready ? <Section title="Request a correction" hint="Your manager checks the request before a punch changes.">
          <T size={12}>{draft.message}</T>
          {!fields.entryId ? <Chips options={data.homes.map(home => [home.id, home.name] as const)} value={fields.homeId ?? ""} onChange={next => change("homeId", next)} /> : null}
          {[['day', 'Day started (YYYY-MM-DD)'], ['start', 'Actual start (HH:MM)'], ['end', 'Actual finish (HH:MM)'], ['reason', 'What happened']].map(([key, label]) => <Field key={key} label={label} value={fields[key] ?? ""} onChangeText={next => change(key, next)} multiline={key === "reason"} maxLength={key === "reason" ? 1000 : 10} />)}
          <T size={12}>A finish earlier than the start means the following day. Times use your agency’s time zone.</T>
          <Button label="Send correction request" busy={busy} onPress={() => void send("correction")} />
        </Section> : null}
        {data.corrections.length ? <Section title="Your correction requests">{data.corrections.map(item => <View key={item.id} style={{ gap: 4 }}><T weight="semibold">{fmt.dayShort(item.clockInAt, zone)} · {item.status}</T><T>{item.reason}</T>{item.decisionNote ? <T>{item.decisionNote}</T> : null}</View>)}</Section> : null}
        {data.punches.map(punch => <Section key={punch.id} title={`${fmt.dayShort(punch.clockInAt, zone)} · ${punch.home ?? "No home"}`}><T>{fmt.time(punch.clockInAt, zone)} – {punch.clockOutAt ? fmt.time(punch.clockOutAt, zone) : "Still open"}</T>{punch.flags.length ? <T size={13}>{punch.flags.join(", ").replace(/_/g, " ")}</T> : null}<Button label="Request a correction" tone="ghost" disabled={!draft.ready} onPress={() => correct(punch)} /></Section>)}
        {!data.punches.length ? <T>No recent punches.</T> : null}
      </> : null}
      {tab === "leave" ? <>
        <Section title="Leave balance"><T size={24} weight="bold">{hours(data.leave.balanceMinutes)} hours</T><T size={13}>Balance used for: {data.leave.balanceTypes.join(", ") || "none"}. Aim to request {data.leave.noticeDays} days ahead.</T></Section>
        {draft.ready ? <Section title="Ask for time off"><T size={12}>{draft.message}</T><Chips options={data.leave.types} value={fields.leaveType ?? ""} onChange={next => change("leaveType", next)} />
          {[["leaveStart", "First day (YYYY-MM-DD)"], ["leaveEnd", "Last day (YYYY-MM-DD)"], ["leaveHours", "Hours in total"], ["leaveReason", "Note for manager (optional)"]].map(([key, label]) => <Field key={key} label={label} value={fields[key] ?? ""} onChangeText={next => change(key, next)} multiline={key === "leaveReason"} maxLength={key === "leaveReason" ? 500 : 10} />)}
          <Button label="Send leave request" busy={busy} onPress={() => void send("leave")} /></Section> : null}
        {data.leave.requests.map(request => <Section key={request.id} title={`${request.type} · ${request.status}`}><T>{request.startDate} – {request.endDate} · {hours(request.minutes)} h{request.paid ? "" : " unpaid"}</T>{request.reason ? <T>{request.reason}</T> : null}{request.decisionNote ? <T>Manager: {request.decisionNote}</T> : null}{request.canCancel ? <Button label="Cancel request" tone="ghost" onPress={() => void send("cancel_leave", { id: request.id })} /> : null}</Section>)}
      </> : null}
      {tab === "sheet" ? <>
        <View style={{ flexDirection: "row", gap: 10 }}><Button label="Earlier period" tone="ghost" style={{ flex: 1 }} onPress={() => setPeriod(plus(data.timesheet.start, -1))} /><Button label="Later period" tone="ghost" style={{ flex: 1 }} disabled={data.timesheet.end >= data.today} onPress={() => setPeriod(plus(data.timesheet.end, 1))} /></View>
        <Section title={`${data.timesheet.start} – ${data.timesheet.end}`}><T weight="semibold">{data.timesheet.status}{data.timesheet.locked ? " · Locked for payroll" : ""}</T><T>Regular {hours(data.timesheet.totals.regular)} h · Overtime {hours(data.timesheet.totals.overtime)} h</T><T>Paid leave {hours(data.timesheet.totals.timeOff)} h · Total paid {hours(data.timesheet.totals.paid)} h</T>{data.timesheet.returnNote ? <ErrorText>{data.timesheet.returnNote}</ErrorText> : null}</Section>
        {data.timesheet.lines.map(line => <Section key={line.id} title={`${line.day} · ${line.home ?? "No home"}`}><T>{fmt.time(line.clockInAt, zone)} – {line.clockOutAt ? fmt.time(line.clockOutAt, zone) : "Still open"}</T><T>{hours(line.minutes)} h · Meal breaks {line.mealMinutes} min</T></Section>)}
        {data.timesheet.adjustments.map((item, index) => <Section key={index} title="Adjustment"><T>{hours(item.minutes)} h · {item.reason}</T></Section>)}
        {data.timesheet.canSign ? <Section title="Sign your timesheet"><T>I confirm these hours are correct and complete, and that I took the breaks shown.</T><Field label="Type your full name" value={signedName} onChangeText={setSignedName} maxLength={160} /><Button label="Sign timesheet" busy={busy} onPress={() => void send("sign")} /></Section> : <T>{data.timesheet.signedName ? `Signed as ${data.timesheet.signedName}.` : `You can sign after this period ends (${data.timesheet.end}) and all punches are closed.`}</T>}
      </> : null}
    </>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
