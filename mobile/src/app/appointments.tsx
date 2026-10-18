import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chips, ErrorText, Section, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { fmt } from "@/lib/format";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
type Visit = { id: string; first: string; last: string; type: string; provider: string; scheduledAt: string; escort: string | null; status: string; followUpBy: string | null };
export default function AppointmentsScreen() {
  const { person } = useLocalSearchParams<{ person?: string }>();
  const { call, me } = useSession();
  const [view, setView] = useState("upcoming"), [error, setError] = useState("");
  const scope = `${me?.agency?.id}.${me?.user.id}.${view}.${person}`;
  const [loaded, setLoaded] = useState<{ scope: string; rows: Visit[] } | null>(null);
  const rows = loaded?.scope === scope ? loaded.rows : [];
  const load = useCallback(() => call<{ rows: Visit[] }>(`/care?mode=appointments&view=${view}${person ? `&person=${encodeURIComponent(person)}` : ""}`).then(result => { setLoaded({ scope, rows: result.rows }); setError(""); }, problem => setError(problem instanceof ApiError ? problem.message : "Could not load visits.")), [call, view, person, scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
    <Button label="Back" tone="ghost" onPress={() => goBack()} /><T size={26} weight="bold">Appointments</T><Button label="Book a visit" icon="plus" onPress={() => router.push({ pathname: "/care-form", params: { action: "book", ...(person ? { person } : {}) } })} />
    <Chips options={[["upcoming", "Upcoming"], ["document", "To document"], ["followup", "Follow-ups"], ["past", "Past"]]} value={view} onChange={next => { if (next) setView(String(next)); }} /><ErrorText>{error}</ErrorText>
    {rows.map(visit => <Section key={visit.id} title={`${visit.first} ${visit.last} · ${visit.type}`}><T>{fmt.dayShort(visit.scheduledAt, me?.agency?.zone)} · {fmt.time(visit.scheduledAt, me?.agency?.zone)}</T>{visit.provider ? <T>{visit.provider}</T> : null}<T size={13}>{visit.escort ? `Escort: ${visit.escort}` : "Escort not assigned"} · {visit.status}</T>{visit.followUpBy ? <T size={13}>Follow-up by {visit.followUpBy}</T> : null}<Button label="Open visit" tone="ghost" onPress={() => router.push({ pathname: "/appointment", params: { id: visit.id } })} /></Section>)}
    {loaded?.scope === scope && !rows.length ? <T>No visits in this view.</T> : null}<Button label="Refresh" tone="ghost" onPress={() => void load()} />
  </ScrollView></SafeAreaView>;
}
