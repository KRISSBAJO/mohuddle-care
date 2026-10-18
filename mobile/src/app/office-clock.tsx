import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Check, ErrorText, Section, T } from "@/components/ui";
import { NoteEditor } from "@/components/NoteEditor";
import { ApiError, type ClockScreen } from "@/lib/api";
import { distanceMeters, readPosition, type Reading } from "@/lib/location";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function OfficeClockScreen() {
  const { call } = useSession();
  const [data, setData] = useState<Extract<ClockScreen, { state: "off" }> | null>(null), [error, setError] = useState("");
  const [reading, setReading] = useState<Reading | null>(null), [reason, setReason] = useState(""), [statements, setStatements] = useState<string[]>([]), [busy, setBusy] = useState(false);
  useEffect(() => { void call<ClockScreen>("/clock").then(result => { if (result.state === "off") setData(result); else setError("You cannot start office work while another punch is open."); }, () => setError("Could not check office access. Go back and try again.")); }, [call]);
  const office = data?.office;
  async function locate() { setReading(null); setReading(await readPosition()); }
  const point = reading?.position, target = office?.point;
  const located = Boolean(point && target?.latitude != null && target.longitude != null && point.accuracy != null && point.accuracy <= Math.min(office!.radius, 100) && distanceMeters(point, { latitude: target.latitude, longitude: target.longitude }) <= office!.radius);
  const required = data?.rules.requirements.includes("statements") ? data.rules.statements : [];
  async function submit() {
    if (busy || !located || !office?.available) return;
    setBusy(true); setError("");
    try { await call("/clock/in", { workType: "office", reason, position: point, statements }); goBack(); }
    catch (problem) { setError(problem instanceof ApiError ? problem.message : "Could not start office work. Check your connection and try again."); setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
    <Button label="Back" tone="ghost" onPress={() => goBack()} /><T size={25} weight="bold">Office / admin work</T><ErrorText>{error}</ErrorText>
    {office?.available ? <>
      <Section title="Work location"><T>{office.address}</T><T size={13}>Your location is read when you check it and when you clock out. There is no background tracking. Office work is kept separate from care visits.</T><Button label="Check office location" icon="map-pin" tone="ghost" onPress={() => void locate()} />{reading ? <T color={located ? colors.sage : colors.flag}>{located ? "Office location verified." : "An accurate location inside the office area is required. Move closer and check again. If your phone cannot locate you, ask your manager to record the missed office time."}</T> : null}</Section>
      <NoteEditor label="What office work will you do?" value={reason} onChange={setReason} maxLength={500} placeholder="For example: review shift notes, prepare the weekly rota and follow up appointments." />
      {required.map(statement => <Check key={statement} checked={statements.includes(statement)} onToggle={() => setStatements(statements.includes(statement) ? statements.filter(item => item !== statement) : [...statements, statement])}>{statement}</Check>)}
      <T size={13}>Another manager must review this completed punch before payroll approval. A due care shift must be worked at its assigned home.</T><Button label="Clock in for office work" busy={busy} disabled={!located || reason.trim().length < 10 || required.some(statement => !statements.includes(statement))} onPress={() => void submit()} />
    </> : <T>{office?.error ?? "Checking office access…"}</T>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
