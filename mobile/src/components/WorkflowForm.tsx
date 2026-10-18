import { useState } from "react";
import { View } from "react-native";
import { ApiError } from "@/lib/api";
import { draftKey } from "@/lib/drafts";
import { useSession } from "@/lib/session";
import { useDraft } from "@/lib/use-draft";
import { FormInput as Field } from "./FormInput";
import { Button, Check, Chips, ErrorText, T } from "./ui";
export type FormField = { key: string; label: string; kind?: "date" | "time"; options?: (string | readonly [string, string])[]; multiline?: boolean; check?: boolean; max?: number };

export function WorkflowForm({ scope, fields, initial = {}, signature, label = "Save", onSave }: { scope: string; fields: FormField[]; initial?: Record<string, string>; signature?: boolean; label?: string; onSave: (fields: Record<string, string>) => Promise<void> }) {
  const { me } = useSession();
  const draft = useDraft<Record<string, string>>(me?.agency ? draftKey(me.user.id, me.agency.id, "workflow", scope) : null);
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const values = { ...initial, ...draft.value };
  async function submit() {
    if (busy || !draft.ready || (signature && !attest)) return;
    setBusy(true); setError("");
    try {
      await draft.flush();
      const payload = Object.fromEntries(Object.entries(values).filter(([key, value]) => !fields.find(field => field.key === key)?.check || value === "on"));
      await onSave({ ...payload, ...(signature ? { attest: "on" } : {}) });
      try { await draft.clear(); } catch { /* The server confirmed the save; do not present it as failed. */ }
      setAttest(false);
    } catch (problem) { setError(problem instanceof ApiError ? problem.message : "Could not save. Your draft is still here."); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 16 }} pointerEvents={busy ? "none" : "auto"}>
    <T size={12} accessibilityLiveRegion="polite">{draft.message}</T>
    {draft.ready ? <>
      {fields.map(field => <View key={field.key} style={{ gap: 6 }}>
        {field.check ? <Check checked={values[field.key] === "on"} onToggle={() => draft.save({ ...values, [field.key]: values[field.key] === "on" ? "" : "on" })}>{field.label}</Check> : field.options ? <><T weight="medium">{field.label}</T><Chips options={field.options} value={values[field.key] ?? ""} onChange={value => draft.save({ ...values, [field.key]: String(value) })} /></> : <Field kind={field.kind} label={field.label} value={values[field.key] ?? ""} onChangeText={value => draft.save({ ...values, [field.key]: value })} multiline={field.multiline} maxLength={field.max ?? 1000} />}
      </View>)}
      {signature ? <Check checked={attest} onToggle={() => setAttest(!attest)}>I confirm this record is accurate and complete and sign as {me?.user.name}.</Check> : null}
      <ErrorText>{error}</ErrorText><Button label={label} busy={busy} disabled={Boolean(signature && !attest)} onPress={() => void submit()} />
    </> : null}
  </View>;
}
