import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText, Field, Section, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
type Directory = { people: { id: string; name: string; home: string | null }[]; page: number; hasMore: boolean };
export default function PeopleScreen() {
  const { call, me } = useSession();
  const [q, setQ] = useState(""), [term, setTerm] = useState(""), [page, setPage] = useState(0), [error, setError] = useState("");
  const scope = `${me?.user.id}.${me?.agency?.id}.${term}.${page}`;
  const [loaded, setLoaded] = useState<{ scope: string; data: Directory } | null>(null);
  const data = loaded?.scope === scope ? loaded.data : null;
  const load = useCallback(() => call<Directory>(`/care?mode=people&q=${encodeURIComponent(term)}&page=${page}`).then(data => { setLoaded({ scope, data }); setError(""); }, problem => setError(problem instanceof ApiError ? problem.message : "Could not load people.")), [call, term, page, scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
    <Button label="Back" tone="ghost" onPress={() => goBack()} /><T weight="bold" size={26}>People and care</T>
    <Field label="Find a person" value={q} onChangeText={setQ} maxLength={100} onSubmitEditing={() => { setPage(0); setTerm(q); }} /><Button label="Search" onPress={() => { setPage(0); setTerm(q); }} />
    <ErrorText>{error}</ErrorText>{data?.people.map(person => <Section key={person.id} title={person.name}><T size={13}>{person.home ?? "No home assigned"}</T><Pressable accessibilityRole="button" style={{ paddingVertical: 10 }} onPress={() => router.push({ pathname: "/person", params: { id: person.id } })}><T weight="semibold">Key facts →</T></Pressable><Button label="Health and care team" tone="ghost" onPress={() => router.push({ pathname: "/health", params: { id: person.id } })} /><Button label="Appointments" tone="ghost" onPress={() => router.push({ pathname: "/appointments", params: { person: person.id } })} /></Section>)}
    {data && !data.people.length ? <T>No matching people.</T> : null}
    <Button label="Previous page" disabled={!page} tone="ghost" onPress={() => setPage(page - 1)} />{data?.hasMore ? <Button label="Next page" tone="ghost" onPress={() => setPage(page + 1)} /> : null}
  </ScrollView></SafeAreaView>;
}
