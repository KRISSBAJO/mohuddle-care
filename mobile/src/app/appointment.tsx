import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText, Section, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import type { VisitDetail } from "@/lib/care";
import { fmt } from "@/lib/format";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
const labels: Record<string, string> = { provider: "Provider", clinic: "Clinic", address: "Address", phone: "Clinic phone", reason: "Reason for visit", prep: "Preparation", transport: "Transport", statusReason: "Why it was closed", seenBy: "Seen by", summary: "Visit summary", diagnosisChanges: "Diagnosis changes", medicationChanges: "Medication changes", orders: "Orders and instructions", followUpBy: "Follow-up by", followUpNotes: "Follow-up instructions" };
export default function AppointmentScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>(); const { call, me } = useSession();
  const scope = `${me?.agency?.id}.${me?.user.id}.${id}`;
  const [loaded, setLoaded] = useState<{ scope: string; data: VisitDetail } | null>(null), [error, setError] = useState("");
  const data = loaded?.scope === scope ? loaded.data : null;
  const load = useCallback(() => call<VisitDetail>(`/care?mode=appointment&id=${encodeURIComponent(id)}`).then(data => { setLoaded({ scope, data }); setError(""); }, problem => setError(problem instanceof ApiError ? problem.message : "Could not open the visit.")), [call, id, scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const open = (action: string) => router.push({ pathname: "/care-form", params: { action, id } });
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
    <Button label="Back" tone="ghost" onPress={() => goBack()} /><ErrorText>{error}</ErrorText>
    {data ? <><T size={26} weight="bold">{data.appointment.type}</T><T weight="semibold">{data.person.firstName} {data.person.lastName}</T><T>{fmt.dayShort(data.appointment.scheduledAt, me?.agency?.zone)} · {fmt.time(data.appointment.scheduledAt, me?.agency?.zone)} · {data.appointment.status}</T>
      <Section title="Escort"><T>{data.escort ?? "No escort assigned"}</T>{data.escortPhone ? <Button label="Call escort" tone="ghost" onPress={() => void Linking.openURL(`tel:${data.escortPhone!.replace(/[^\d+]/g, "")}`)} /> : null}</Section>
      {data.person.allergies ? <Section title="Allergies" tone="warn"><T>{data.person.allergies}</T></Section> : null}
      {Object.entries(labels).filter(([key]) => data.appointment[key]).map(([key, label]) => <Section key={key} title={label}><T>{String(data.appointment[key])}</T></Section>)}
      {data.canChange ? <><Button label="Change booking or escort" onPress={() => open("update")} /><Button label="Cancel visit" tone="ghost" onPress={() => open("cancelled")} /><Button label="Record missed visit" tone="ghost" onPress={() => open("missed")} /></> : null}
      {data.canDocument ? <Button label="Document this visit" onPress={() => open("document")} /> : null}
      {data.appointment.followUpNeeded && !data.next ? <Button label="Book the follow-up" onPress={() => open("book")} /> : null}
      {data.next ? <Button label={`Open follow-up · ${fmt.dayShort(data.next.scheduledAt, me?.agency?.zone)}`} tone="ghost" onPress={() => router.push({ pathname: "/appointment", params: { id: data.next!.id } })} /> : null}
      <Section title="Previous visits">{data.history.length ? data.history.map(visit => <Button key={visit.id} label={`${fmt.dayShort(visit.scheduledAt, me?.agency?.zone)} · ${visit.type} · ${visit.status}`} tone="ghost" onPress={() => router.push({ pathname: "/appointment", params: { id: visit.id } })} />) : <T>No previous visits of this type.</T>}</Section>
      <Button label="Person’s key facts" tone="ghost" onPress={() => router.push({ pathname: "/person", params: { id: data.person.id } })} />
    </> : <Button label="Try again" tone="ghost" onPress={() => void load()} />}
  </ScrollView></SafeAreaView>;
}
