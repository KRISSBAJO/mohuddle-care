import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WorkflowForm, type FormField } from "@/components/WorkflowForm";
import { Button, ErrorText, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import type { BookingForm, HealthData, VisitDetail } from "@/lib/care";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function CareFormScreen() {
  const { action = "book", id = "", person = "", contactId = "" } = useLocalSearchParams<{ action: string; id?: string; person?: string; contactId?: string }>();
  const { call, me } = useSession();
  const scope = `${me?.agency?.id}.${me?.user.id}.${action}.${id}.${person}.${contactId}`;
  const [loaded, setLoaded] = useState<{ scope: string; fields: FormField[]; initial: Record<string, string> } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    async function prepare() {
      const fields: FormField[] = [], initial: Record<string, string> = {};
      const add = (key: string, label: string, multiline = false, max = 1000) => fields.push({ key, label, multiline, max, kind: ["date", "recordedOn", "noteDate", "followUpBy", "nextDate", "dueDate", "day"].includes(key) ? "date" : ["time", "startTime", "endTime", "nextTime", "start", "end", "dueTime"].includes(key) ? "time" : undefined });
      if (["book", "update", "document", "cancelled", "missed"].includes(action)) {
        const booking = await call<BookingForm>("/care?mode=booking");
        const detail = id ? await call<VisitDetail>(`/care?mode=appointment&id=${encodeURIComponent(id)}`) : null;
        if (action === "book" || action === "update") {
          if (action === "book" && !id) fields.push({ key: "individualId", label: "Person supported", options: booking.people.map(item => [item.value, item.label] as const) });
          initial.individualId = detail?.person.id ?? person;
          initial.escortStaffId = ""; initial.durationMinutes = "60"; initial.date = booking.today;
          if (detail) {
            for (const key of ["type", "provider", "clinic", "address", "phone", "durationMinutes", "reason", "prep", "transport", "escortStaffId"]) initial[key] = String(detail.appointment[key] ?? "");
            if (action === "update") {
              initial.date = new Intl.DateTimeFormat("en-CA", { timeZone: me?.agency?.zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(detail.appointment.scheduledAt));
              initial.time = new Intl.DateTimeFormat("en-GB", { timeZone: me?.agency?.zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(detail.appointment.scheduledAt));
            } else initial.followUpOf = id;
          }
          fields.push({ key: "type", label: "Visit type", options: [...new Set([...booking.types, initial.type].filter(Boolean))] });
          for (const [key, label] of [["provider", "Provider"], ["clinic", "Clinic"], ["address", "Address"], ["phone", "Clinic phone"], ["date", "Date (YYYY-MM-DD)"], ["time", "Time (HH:MM)"], ["durationMinutes", "Duration in minutes"], ["reason", "Reason for visit"], ["prep", "Preparation"], ["transport", "Transport"]]) add(key, label, ["reason", "prep"].includes(key));
          fields.push({ key: "escortStaffId", label: "Escort (optional)", options: booking.staff.map(item => [item.value, item.label] as const) });
        } else if (action === "document") {
          add("seenBy", "Seen by", false, 120); add("summary", "What happened at the visit", true, 5000);
          for (const [key, label] of [["diagnosisChanges", "Diagnosis changes"], ["medicationChanges", "Medication changes"], ["orders", "Orders and instructions"]]) add(key, label, true, 2000);
          fields.push({ key: "followUpNeeded", label: "A follow-up is needed", check: true });
          add("followUpBy", "Follow-up by (YYYY-MM-DD, optional)"); initial.followUpBy = "";
          add("followUpNotes", "Follow-up instructions", true); add("nextDate", "Book next visit: date (optional)"); add("nextTime", "Next visit: time (optional)");
        } else add("reason", action === "missed" ? "Why it was missed" : "Why it is cancelled", true, 500);
      } else {
        const health = await call<HealthData>(`/care?mode=health&id=${encodeURIComponent(id)}`);
        if (action === "weight") { initial.recordedOn = health.today; add("recordedOn", "Date (YYYY-MM-DD)"); add("pounds", "Weight in pounds"); add("heightInches", "Height in inches (optional)"); add("comments", "Comments", true); }
        else if (action === "plan") { for (const key of ["weightLow", "weightHigh", "heightInches"] as const) initial[key] = String(health.person[key] ?? ""); add("weightLow", "Suggested low weight (lb)"); add("weightHigh", "Suggested high weight (lb)"); add("heightInches", "Height (inches)"); }
        else if (action === "contact") {
          const current = health.contacts.find(item => item.id === contactId);
          for (const [key, label] of [["role", "Role, such as primary doctor"], ["name", "Name"], ["organization", "Organization"], ["phone", "Phone"], ["altPhone", "Other phone"], ["email", "Email"], ["fax", "Fax"], ["address", "Address"], ["notes", "Notes"]]) { add(key, label, key === "notes"); if (current) initial[key] = String(current[key] ?? ""); }
          fields.push({ key: "isPrimary", label: "Main contact for this role", check: true }); if (current?.isPrimary) initial.isPrimary = "on";
        } else throw new Error("Unknown form.");
      }
      if (live) setLoaded({ scope, fields, initial });
    }
    void prepare().catch(problem => { if (live) setError(problem instanceof ApiError ? problem.message : "Could not open the form."); });
    return () => { live = false; };
  }, [call, action, id, person, contactId, scope, me?.agency?.zone]);
  const title = ({ book: "Book a visit", update: "Change the booking", document: "Document the visit", cancelled: "Cancel visit", missed: "Record missed visit", weight: "Record weight", plan: "Weight range and height", contact: "Care team contact" } as Record<string, string>)[action] ?? "Care record";
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
    <Button label="Back" tone="ghost" onPress={() => goBack()} /><T size={25} weight="bold">{title}</T><T size={13}>Dates and times use your agency’s time zone.</T><ErrorText>{error}</ErrorText>
    {loaded?.scope === scope ? <WorkflowForm key={scope} scope={scope} fields={loaded.fields} initial={loaded.initial} signature={action === "weight"} label={action === "document" ? "Save visit record" : title} onSave={async fields => {
      const result = await call<{ id?: string }>("/care", { action, ...(id ? { id } : {}), ...(contactId ? { contactId } : {}), fields });
      if (["weight", "plan", "contact"].includes(action)) goBack();
      else router.replace({ pathname: "/appointment", params: { id: result.id ?? id } });
    }} /> : null}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
