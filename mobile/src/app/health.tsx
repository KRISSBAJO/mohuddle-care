import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Polyline } from "react-native-svg";
import { Button, ErrorText, Section, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import type { HealthData } from "@/lib/care";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function HealthScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>(); const { call, me } = useSession();
  const scope = `${me?.agency?.id}.${me?.user.id}.${id}`;
  const [loaded, setLoaded] = useState<{ scope: string; data: HealthData } | null>(null), [error, setError] = useState("");
  const data = loaded?.scope === scope ? loaded.data : null;
  const load = useCallback(() => call<HealthData>(`/care?mode=health&id=${encodeURIComponent(id)}`).then(data => { setLoaded({ scope, data }); setError(""); }, problem => setError(problem instanceof ApiError ? problem.message : "Could not load health history.")), [call, id, scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const weights = [...(data?.weights ?? [])].reverse();
  const low = Math.min(...weights.map(item => item.pounds)), high = Math.max(...weights.map(item => item.pounds));
  const points = weights.map((item, index) => `${15 + index * 270 / Math.max(1, weights.length - 1)},${110 - (item.pounds - low) * 90 / Math.max(1, high - low)}`).join(" ");
  const open = (action: string, contactId?: string) => router.push({ pathname: "/care-form", params: { action, id, ...(contactId ? { contactId } : {}) } });
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
    <Button label="Back" tone="ghost" onPress={() => goBack()} /><ErrorText>{error}</ErrorText>
    {data ? <><T size={25} weight="bold">{data.person.name}</T><T>Health and care team</T>
      <Button label="Appointments and visit history" onPress={() => router.push({ pathname: "/appointments", params: { person: id } })} /><Button label="Record a weight" onPress={() => open("weight")} />
      <Section title="Weight history" hint={data.person.weightLow || data.person.weightHigh ? `Suggested range: ${data.person.weightLow ?? "—"}–${data.person.weightHigh ?? "—"} lb` : "No suggested range set."}>
        {weights.length > 1 ? <><T size={12}>{low}–{high} lb · {weights[0].recordedOn} to {weights[weights.length - 1].recordedOn}</T><Svg width="100%" height={130} viewBox="0 0 300 130" accessible accessibilityLabel={`Weight trend from ${weights[0].pounds} to ${weights[weights.length - 1].pounds} pounds`}><Polyline points={points} fill="none" stroke={colors.brand} strokeWidth={3} /></Svg></> : null}
        {data.weights.length ? data.weights.map(item => <Section key={item.id} title={`${item.recordedOn} · ${item.pounds} lb`}><T size={13}>BMI {item.bmi ?? "not recorded"} · Signed by {item.signedName}</T>{item.comments ? <T>{item.comments}</T> : null}</Section>) : <T>No weights recorded.</T>}
        {data.canEdit ? <Button label="Edit suggested range and height" tone="ghost" onPress={() => open("plan")} /> : null}
      </Section>
      <Section title="Care team">{data.contacts.map(contact => <Section key={contact.id} title={`${contact.role} · ${contact.name}`}><T>{contact.organization}</T>{contact.phone ? <Button label={`Call ${contact.phone}`} tone="ghost" onPress={() => void Linking.openURL(`tel:${contact.phone.replace(/[^\d+]/g, "")}`)} /> : null}{contact.email ? <T>{contact.email}</T> : null}{data.canEdit ? <Button label="Edit contact" tone="ghost" onPress={() => open("contact", contact.id)} /> : null}</Section>)}{!data.contacts.length ? <T>No care team contacts recorded.</T> : null}{data.canEdit ? <Button label="Add care team contact" tone="ghost" onPress={() => open("contact")} /> : null}</Section>
      <Section title="Clinical notes and observations · latest 30">{data.history.length ? data.history.map((entry, index) => <Section key={`${entry.day}.${index}`} title={entry.day}><T>{entry.health || "No health narrative recorded."}</T>{Object.entries(entry.vitals).map(([key, value]) => <T key={key} size={13}>{key}: {value}</T>)}<T size={12}>Signed by {entry.signedName}</T></Section>) : <T>No shift observations recorded.</T>}</Section>
      <Section title="Insurance">{data.insurance.map(item => <T key={item.id}>{item.rank} · {item.payer} {item.plan} · {item.active ? "Active" : "Ended"}</T>)}{!data.insurance.length ? <T>No insurance recorded.</T> : null}</Section>
    </> : <Button label="Try again" tone="ghost" onPress={() => void load()} />}
  </ScrollView></SafeAreaView>;
}
