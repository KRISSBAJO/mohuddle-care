import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WorkflowForm } from "@/components/WorkflowForm";
import { Button, ErrorText, Section, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { fmt } from "@/lib/format";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
type Shift = { id: string; homeId: string; staffId: string | null; patternId: string | null; startsAt: string; endsAt: string; note: string; status: string };
type Schedule = { start: string; days: string[]; shifts: Shift[]; homes: { id: string; name: string }[]; staff: { id: string; firstName: string; lastName: string; expiredCredentials: string[] }[]; rules: { patterns: { id: string; name: string; start: string; end: string }[] }; issues: { key: string; text: string; homeId?: string; shiftId?: string; day?: string; patternId?: string }[] };
const plus = (day: string, amount: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
export default function ManagerScheduleScreen() {
  const { call, me } = useSession(); const [week, setWeek] = useState("");
  const scope = `${me?.agency?.id}.${me?.user.id}.${week}`;
  const [loaded, setLoaded] = useState<{ scope: string; data: Schedule } | null>(null), [error, setError] = useState("");
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const data = loaded?.scope === scope ? loaded.data : null;
  const load = useCallback(() => call<Schedule>(`/operations?mode=schedule${week ? `&week=${week}` : ""}`).then(data => { setLoaded({ scope, data }); setError(""); }, problem => setError(problem instanceof ApiError ? problem.message : "Could not load the schedule.")), [call, week, scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  function edit(shift?: Shift, issue?: Schedule["issues"][number]) {
    const day = shift ? new Intl.DateTimeFormat("en-CA", { timeZone: me?.agency?.zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(shift.startsAt)) : issue?.day ?? data?.start ?? "";
    const clock = (at: string) => new Intl.DateTimeFormat("en-GB", { timeZone: me?.agency?.zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
    const pattern = data?.rules.patterns.find(item => item.id === issue?.patternId);
    setEditing({ id: shift?.id ?? "", homeId: shift?.homeId ?? issue?.homeId ?? "", staffId: shift?.staffId ?? "", day, start: shift ? clock(shift.startsAt) : pattern?.start ?? "07:00", end: shift ? clock(shift.endsAt) : pattern?.end ?? "15:00", patternId: shift?.patternId ?? pattern?.id ?? "", note: shift?.note ?? "" });
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
    <Button label="Back" tone="ghost" onPress={() => goBack()} /><T size={25} weight="bold">Schedule and coverage</T><ErrorText>{error}</ErrorText>
    {data ? <>
      {editing ? <Section title={editing.id ? "Edit shift or assign cover" : "Create a shift"}><WorkflowForm key={editing.id || `${editing.homeId}.${editing.day}`} scope={`shift.${editing.id || `${editing.homeId}.${editing.day}`}`} initial={editing} fields={[
        { key: "homeId", label: "Home", options: data.homes.map(home => [home.id, home.name] as const) },
        { key: "day", label: "Date (YYYY-MM-DD)", max: 10 }, { key: "start", label: "Start (HH:MM)", max: 5 }, { key: "end", label: "Finish (HH:MM)", max: 5 },
        { key: "staffId", label: "Staff member (leave empty for an open shift)", options: data.staff.map(person => [person.id, `${person.firstName} ${person.lastName}${person.expiredCredentials.length ? " · check credentials" : ""}`] as const) }, { key: "note", label: "Shift note", multiline: true, max: 300 },
      ]} onSave={async fields => {
        await call("/operations", { action: "shift", input: { ...(fields.id ? { id: fields.id } : {}), homeId: fields.homeId, day: fields.day, start: fields.start, end: fields.end, staffId: fields.staffId || null, patternId: fields.patternId || null, note: fields.note ?? "" } });
        setEditing(null); await load();
      }} /><Button label="Close editor" tone="ghost" onPress={() => setEditing(null)} /></Section> : <>
        <View style={{ flexDirection: "row", gap: 10 }}><Button label="Earlier week" tone="ghost" style={{ flex: 1 }} onPress={() => setWeek(plus(data.start, -7))} /><Button label="Later week" tone="ghost" style={{ flex: 1 }} onPress={() => setWeek(plus(data.start, 7))} /></View><T>Week of {data.start}</T><Button label="Create shift" icon="plus" onPress={() => edit()} />
        <Section title="Coverage and staffing checks">{data.issues.length ? data.issues.map(issue => <View key={issue.key} style={{ gap: 8 }}><T>{issue.text}</T>{issue.shiftId || issue.homeId ? <Button label={issue.shiftId ? "Review shift" : "Arrange coverage"} tone="ghost" onPress={() => edit(data.shifts.find(shift => shift.id === issue.shiftId), issue)} /> : null}</View>) : <T>No staffing issues found for this week.</T>}</Section>
        {data.shifts.filter(shift => { const day = new Intl.DateTimeFormat("en-CA", { timeZone: me?.agency?.zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(shift.startsAt)); return day >= data.start && day <= data.days[6]; }).map(shift => {
          const staff = data.staff.find(person => person.id === shift.staffId);
          return <Section key={shift.id} title={`${fmt.dayShort(shift.startsAt, me?.agency?.zone)} · ${data.homes.find(home => home.id === shift.homeId)?.name ?? "Home"}`}><T>{fmt.time(shift.startsAt, me?.agency?.zone)} – {fmt.time(shift.endsAt, me?.agency?.zone)}</T><T>{staff ? `${staff.firstName} ${staff.lastName}` : "Open shift"} · {shift.status}</T>{!["completed", "missed"].includes(shift.status) ? <Button label="Edit or assign cover" tone="ghost" onPress={() => edit(shift)} /> : null}</Section>;
        })}
      </>}
    </> : <Button label="Try again" tone="ghost" onPress={() => void load()} />}
  </ScrollView></SafeAreaView>;
}
