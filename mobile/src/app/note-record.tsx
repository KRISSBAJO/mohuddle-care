import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chips, ErrorText, Field, Section, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { draftKey } from "@/lib/drafts";
import { fmt } from "@/lib/format";
import { goBack } from "@/lib/nav";
import { type NoteRecord, words } from "@/lib/note-workflow";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { useDraft } from "@/lib/use-draft";

function Recorded({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <T color={colors.mute}>Not recorded</T>;
  if (typeof value === "boolean") return <T>{value ? "Yes" : "No"}</T>;
  if (Array.isArray(value)) return <View style={{ gap: 8 }}>{value.map((entry, index) => <Recorded key={index} value={entry} />)}</View>;
  if (typeof value === "object") return <View style={{ gap: 5 }}>{Object.entries(value).filter(([key]) => !/Id$|^id$|^agencyId$/.test(key)).map(([key, entry]) => <View key={key}><T size={12} color={colors.mute}>{words(key)}</T><Recorded value={entry} /></View>)}</View>;
  return <T>{String(value)}</T>;
}

export default function NoteRecordScreen() {
  const { id = "", kind = "daily" } = useLocalSearchParams<{ id: string; kind: string }>();
  const { call, me } = useSession();
  const scope = `${me?.agency?.id}.${me?.user.id}.${kind}.${id}`;
  const [loaded, setLoaded] = useState<{ scope: string; data: NoteRecord } | null>(null);
  const data = loaded?.scope === scope ? loaded.data : null;
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = useDraft<{ version: string; fields: Record<string, string> }>(me?.agency ? draftKey(me.user.id, me.agency.id, "amend", `${kind}.${id}`) : null);
  const load = useCallback(() => call<NoteRecord>(`/notes/record?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`).then(
    result => { setLoaded({ scope, data: result }); setError(""); },
    problem => setError(problem instanceof ApiError ? problem.message : "Could not open this note. Try again."),
  ), [call, id, kind, scope]);
  useEffect(() => { void load(); }, [load]);
  const stale = Boolean(data && draft.value && data.version !== draft.value.version);
  const fields = draft.value?.fields ?? data?.fields ?? {};
  function change(key: string, value: string) { if (data) draft.save({ version: data.version, fields: { ...fields, [key]: value } }); }
  async function act(action: "edit" | "approve" | "return" | "reopen") {
    if (!data || busy || (action === "edit" && stale)) return;
    setBusy(true); setError("");
    try {
      if (action === "edit") await draft.flush();
      await call("/notes/record", { id, kind, action, version: data.version, fields: action === "edit" ? { ...fields, reason: fields.reason ?? "" } : { reason } });
      if (action === "edit") { await draft.clear(); setEditing(false); }
      setReason(""); await load();
    } catch (problem) { setError(problem instanceof ApiError ? problem.message : "Could not save. Your changes are still here."); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView pointerEvents={busy ? "none" : "auto"} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Button label="Back to notes" tone="ghost" onPress={() => goBack()} />
        <ErrorText>{error}</ErrorText>
        {!data ? <><ActivityIndicator color={colors.brand} /><Button label="Try again" tone="ghost" onPress={() => void load()} /></> : <>
          <T weight="bold" size={25}>{data.note.person}</T>
          <T>{kind === "daily" ? "Shift note" : "Community Participation"} · {data.note.day} · {words(data.note.status ?? "submitted")}</T>
          <T size={13} color={colors.mute}>Signed by {data.note.signedName}{data.note.signedAt ? ` · ${fmt.dayShort(data.note.signedAt, me?.agency?.zone)}` : ""}</T>
          {data.note.returnReason ? <Section title="What to correct" tone="warn"><T>{data.note.returnReason}</T></Section> : null}
          {editing ? <>
            <T size={13} accessibilityLiveRegion="polite">{draft.message}</T>
            {stale ? <Section title="This note changed" tone="warn"><T>Your saved correction belongs to an earlier version. Copy anything you need before discarding it and starting from the current note.</T><Button label="Discard earlier correction" tone="ghost" onPress={() => void draft.clear()} /></Section> : null}
            {!stale && draft.ready ? <>
              {Object.entries(data.labels).map(([key, label]) => <Section key={key} title={label}>
                {key === "location" && kind === "daily" ? <Chips options={[...new Set([...data.locations, fields[key]].filter(Boolean))]} value={fields[key] ?? ""} onChange={next => change(key, String(next))} />
                  : key === "mood" ? <Chips options={data.moods} value={fields[key] ?? ""} onChange={next => change(key, String(next))} />
                    : key === "costCenter" ? <Chips options={[...new Set([...data.costCenters, fields[key]].filter(Boolean))]} value={fields[key] ?? ""} onChange={next => change(key, String(next))} />
                      : <Field label={label} value={fields[key] ?? ""} onChangeText={next => change(key, next)} multiline={!/Time$|^time|^trips$|^noteDate$/.test(key)} maxLength={key === "notes" || key === "note" ? 5000 : 3000} />}
              </Section>)}
              {Object.keys(data.fields).filter(key => key.startsWith("timeline.")).map(key => <Field key={key} label={`Hour ${key.slice(9)}`} value={fields[key] ?? ""} onChangeText={next => change(key, next)} maxLength={500} />)}
              <Field label={data.rights.writer ? "Note to reviewer (optional)" : "Reason for correction"} value={fields.reason ?? ""} onChangeText={next => change("reason", next)} maxLength={1000} multiline />
              <T size={13}>Personal care levels and goal data remain as signed. Every correction is recorded with your name.</T>
              <Button label={data.rights.writer && data.note.status === "returned" ? "Save and resubmit" : "Save correction"} busy={busy} onPress={() => void act("edit")} />
            </> : null}
            <Button label="Read note" tone="ghost" onPress={() => setEditing(false)} />
          </> : <>
            {Object.entries(data.fields).filter(([, value]) => value !== "").map(([key, value]) => <Section key={key} title={data.labels[key] ?? words(key)}><T>{value}</T></Section>)}
            {data.details.map(([key, value]) => <Section key={key} title={words(key)}><Recorded value={value} /></Section>)}
            {data.goals.length ? <Section title="Plan goals"><Recorded value={data.goals} /></Section> : null}
            {data.rights.edit ? <Button label={data.note.status === "returned" && data.rights.writer ? "Correct and resubmit" : "Amend note"} disabled={!draft.ready} onPress={() => setEditing(true)} /> : null}
            {data.rights.approve || data.rights.returnIt || data.rights.reopen ? <Section title="Review">
              <Field label="What needs fixing" value={reason} onChangeText={setReason} multiline maxLength={1000} />
              {data.rights.approve ? <Button label="Approve and lock note" busy={busy} onPress={() => void act("approve")} /> : null}
              {data.rights.returnIt ? <Button label="Return to writer" tone="ghost" busy={busy} onPress={() => void act("return")} /> : null}
              {data.rights.reopen ? <Button label="Reopen approved note" tone="ghost" busy={busy} onPress={() => void act("reopen")} /> : null}
            </Section> : null}
          </>}
          <Section title="History">{data.events.length ? data.events.map(event => <View key={event.id} style={{ gap: 6 }}><T weight="semibold">{words(event.action)} · {event.by ?? "Team"}</T><T size={12}>{fmt.dayShort(event.at, me?.agency?.zone)} · {fmt.time(event.at, me?.agency?.zone)}</T>{event.note ? <T>{event.note}</T> : null}{event.changes.map((change, index) => <View key={index}><T weight="medium">{change.field}</T><T size={13}>Before: {change.before || "Empty"}</T><T size={13}>After: {change.after || "Empty"}</T></View>)}</View>) : <T>No corrections or reviews yet.</T>}</Section>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
