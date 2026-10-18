import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Check, Chips, ErrorText, Field, Section, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { draftKey } from "@/lib/drafts";
import { goBack } from "@/lib/nav";
import { communityLabels, type NoteInbox } from "@/lib/note-workflow";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { useDraft } from "@/lib/use-draft";

export default function CommunityNoteScreen() {
  const { call, me } = useSession();
  const draft = useDraft<Record<string, string>>(me?.agency ? draftKey(me.user.id, me.agency.id, "community", "new") : null);
  const [form, setForm] = useState<NoteInbox | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attest, setAttest] = useState(false);
  useEffect(() => { void call<NoteInbox>("/notes/workflow").then(setForm, problem => setError(problem instanceof ApiError ? problem.message : "Could not load the form.")); }, [call]);
  const fields = { noteDate: form?.community.today ?? "", ...draft.value } as Record<string, string>;
  const change = (key: string, value: string | string[]) => draft.save({ ...fields, _requestId: fields._requestId || randomUUID(), [key]: String(value) });
  async function save() {
    if (busy || !attest) return;
    setBusy(true); setError("");
    try {
      await draft.flush();
      const result = await call<{ id: string }>("/notes/workflow", { fields: { ...fields, attest: "on" } });
      try { await draft.clear(); } catch { /* Already saved; do not resubmit. */ }
      router.replace({ pathname: "/note-record", params: { kind: "community", id: result.id } });
    } catch (problem) { setError(problem instanceof ApiError ? problem.message : "Could not save. Your draft is still here."); setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}><ScrollView pointerEvents={busy ? "none" : "auto"} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
    <Button label="Back to notes" tone="ghost" onPress={() => goBack()} /><T weight="bold" size={24}>Community Participation</T><ErrorText>{error}</ErrorText><T size={13}>{draft.message}</T>
    {form && draft.ready ? <>
      <Section title="Person supported"><Chips options={form.people.map(person => [person.id, person.name] as const)} value={fields.individualId ?? ""} onChange={next => change("individualId", next)} /></Section>
      {Object.entries(communityLabels).map(([key, label]) => <Field key={key} label={label} value={fields[key] ?? ""} onChangeText={next => change(key, next)} multiline={!/Time$|^trips$|^noteDate$/.test(key)} maxLength={key === "note" ? 5000 : key === "learning" ? 3000 : key === "otherParty" ? 200 : key === "location" ? 1000 : 2000} />)}
      <Section title="Cost center (optional)"><Chips options={form.community.costCenters} value={fields.costCenter ?? ""} onChange={next => change("costCenter", next)} /></Section>
      <Section title="Other staff present (optional)"><Chips options={form.staff.map(person => [person.id, person.name] as const)} value={fields.withStaffId ?? ""} onChange={next => change("withStaffId", next)} /></Section>
      <T size={13}>Write at least {form.community.minimum} characters about how it went. Times use your agency’s time zone.</T>
      <Check checked={attest} onToggle={() => setAttest(!attest)}>This note is accurate and complete. I am signing as {me?.user.name}.</Check>
      <Button label="Sign and save" busy={busy} disabled={!attest} onPress={() => void save()} />
    </> : null}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
