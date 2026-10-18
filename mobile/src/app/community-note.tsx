import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Check, Chips, ErrorText, Section, T } from "@/components/ui";
import { FormInput as Field } from "@/components/FormInput";
import { ApiError } from "@/lib/api";
import { draftKey } from "@/lib/drafts";
import { goBack } from "@/lib/nav";
import { type NoteInbox } from "@/lib/note-workflow";
import { parseClock } from "@/lib/date-input";
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
  const start = parseClock(fields.startTime ?? ""), finish = parseClock(fields.endTime ?? "");
  const duration = start && finish ? (finish.hour - start.hour) * 60 + finish.minute - start.minute : null;
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
      <Section title="Activity details">
        <Field label="Date" kind="date" value={fields.noteDate ?? ""} onChangeText={next => change("noteDate", next)} />
        <View style={{ flexDirection: "row", gap: 12 }}><View style={{ flex: 1 }}><Field label="Started" kind="time" value={fields.startTime ?? ""} onChangeText={next => change("startTime", next)} /></View><View style={{ flex: 1 }}><Field label="Finished" kind="time" value={fields.endTime ?? ""} onChangeText={next => change("endTime", next)} /></View></View>
        {duration !== null ? <T size={13} color={colors.sage}>{duration > 0 ? `${Math.floor(duration / 60)} h ${duration % 60} min of support` : "Finish must be after the start, on the same day."}</T> : null}
        <Field label="Number of trips" value={fields.trips ?? ""} onChangeText={next => change("trips", next)} maxLength={2} />
        <Field label="Other responsible party (optional)" value={fields.otherParty ?? ""} onChangeText={next => change("otherParty", next)} maxLength={200} />
      </Section>
      <Section title="Choice and activity" hint="Describe what they chose, where they went and what support you provided.">
        <Field label="How the activity was selected" value={fields.selection ?? ""} onChangeText={next => change("selection", next)} multiline maxLength={2000} />
        <Field label="Where it took place" value={fields.location ?? ""} onChangeText={next => change("location", next)} maxLength={1000} />
        <Field label="Activity and support provided" value={fields.activity ?? ""} onChangeText={next => change("activity", next)} multiline maxLength={2000} />
      </Section>
      <Section title="How it went" hint={`At least ${form.community.minimum} characters. Write what you observed and how the person responded.`}>
        <Field label="Participation note" value={fields.note ?? ""} onChangeText={next => change("note", next)} multiline maxLength={5000} />
        <Field label="Learning opportunities (optional)" value={fields.learning ?? ""} onChangeText={next => change("learning", next)} multiline maxLength={3000} />
      </Section>
      <Section title="Cost center (optional)"><Chips options={form.community.costCenters} value={fields.costCenter ?? ""} onChange={next => change("costCenter", next)} /></Section>
      <Section title="Other staff present (optional)"><Chips options={form.staff.map(person => [person.id, person.name] as const)} value={fields.withStaffId ?? ""} onChange={next => change("withStaffId", next)} /></Section>
      <T size={13}>Write at least {form.community.minimum} characters about how it went. Times use your agency’s time zone.</T>
      <Check checked={attest} onToggle={() => setAttest(!attest)}>This note is accurate and complete. I am signing as {me?.user.name}.</Check>
      <Button label="Sign and save" busy={busy} disabled={!attest} onPress={() => void save()} />
    </> : null}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
