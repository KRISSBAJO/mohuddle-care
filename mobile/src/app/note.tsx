import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SpeakNote, type Draft } from "@/components/SpeakNote";
import { Button, Check, Chips, ErrorText, Field, Icon, Section, styles as ui, T } from "@/components/ui";
import { ApiError, type NoteForm, type SectionKey } from "@/lib/api";
import { fmt } from "@/lib/format";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

type Fields = Record<string, string | string[]>;

const YES_NO = [
  ["yes", "Yes"],
  ["no", "No"],
] as const;
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const hourLabel = (hour: string) => {
  const value = Number(hour.slice(0, 2));
  return `${value % 12 || 12} ${value < 12 ? "AM" : "PM"}`;
};

/* A written answer of a few lines. */
function Area({ label, value, onChange, placeholder, hint }: { label?: string; value: string; onChange: (next: string) => void; placeholder?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <T weight="medium" size={14}>
          {label}
        </T>
      ) : null}
      <TextInput multiline value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.dim} maxLength={5000} style={[ui.field, ui.area]} />
      {hint ? (
        <T size={12} color={colors.mute}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/* A short number, such as hours slept or a pulse. */
function Num({ label, value, onChange, unit }: { label: string; value: string; onChange: (next: string) => void; unit?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 130, gap: 6 }}>
      <T weight="medium" size={14}>
        {label}
        {unit ? (
          <T size={13} color={colors.mute}>
            {" "}
            ({unit})
          </T>
        ) : null}
      </T>
      <TextInput value={value} onChangeText={next => onChange(next.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" style={ui.field} />
    </View>
  );
}

/* One shift note for one person, laid out from what their note asks, with Speak your note at the top. */
export default function NoteScreen() {
  const params = useLocalSearchParams<{ person: string; shift?: string }>();
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [form, setForm] = useState<NoteForm | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const query = `person=${encodeURIComponent(params.person ?? "")}${params.shift ? `&shift=${encodeURIComponent(params.shift)}` : ""}`;
    return call<NoteForm>(`/notes/form?${query}`).then(
      data => {
        setForm(data);
        setFields({ individualId: data.person.id, ...(data.shift ? { shiftId: data.shift.id } : {}), logDate: data.defaults.logDate, shift: data.defaults.shift, timeIn: data.defaults.timeIn, timeOut: data.defaults.timeOut });
      },
      problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
    );
  }, [call, params.person, params.shift]);
  useEffect(() => {
    void load();
  }, [load]);

  const value = (name: string) => {
    const current = fields[name];
    return typeof current === "string" ? current : "";
  };
  const list = (name: string) => {
    const current = fields[name];
    return Array.isArray(current) ? current : [];
  };
  const set = (name: string) => (next: string | string[]) => setFields(previous => ({ ...previous, [name]: next }));
  const on = (key: SectionKey) => form?.sections.find(section => section.key === key)?.on ?? false;
  const required = (key: SectionKey) => form?.sections.find(section => section.key === key)?.required ?? false;
  const title = (key: SectionKey) => form?.sections.find(section => section.key === key)?.title ?? key;

  // A spoken draft fills the parts that are still empty; nothing typed is overwritten.
  const applyDraft = useCallback(
    (draft: Draft) => {
      let filled = 0;
      const next: Fields = {};
      for (const [key, raw] of Object.entries(draft)) {
        if (raw === null || raw === "" || raw === undefined) continue;
        const name = key === "behaviourOccurred" ? "behaviourAnswer" : key;
        const text = key === "behaviourOccurred" ? (raw ? "yes" : "no") : String(raw);
        if (key === "behaviourOccurred" && !on("behaviour")) continue;
        if (value(name)) continue;
        next[name] = text;
        if (key !== "behaviourOccurred" || raw) filled += 1;
      }
      setFields(previous => ({ ...previous, ...next }));
      return filled;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the latest fields through value()
    [fields, form],
  );

  async function save() {
    setError("");
    setBusy(true);
    try {
      await call("/notes", { fields });
      goBack();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  if (!form)
    return (
      <View style={{ flex: 1, backgroundColor: colors.ground }}>
        <Bar />
        <View style={{ padding: 20 }}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.brand} />}</View>
      </View>
    );

  const summaryLength = value("notes").trim().length;
  const behaviourYes = value("behaviourAnswer") === "yes";

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <Bar />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={[styles.person, shadow.soft]}>
            <T weight="bold" size={20} style={{ letterSpacing: -0.4 }}>
              {form.person.name}
            </T>
            {form.shift ? (
              <T size={14} color={colors.mute}>
                {form.shift.name} · {form.shift.home} · {fmt.time(form.shift.startsAt, zone)} – {fmt.time(form.shift.endsAt, zone)}
              </T>
            ) : null}
            {form.person.allergies ? (
              <View style={styles.allergy}>
                <Icon name="alert-circle" size={14} color={colors.flag} />
                <T size={13} weight="semibold" color={colors.flag} style={{ flex: 1 }}>
                  Allergies: {form.person.allergies}
                </T>
              </View>
            ) : null}
          </View>

          {form.scribe ? <SpeakNote personId={form.person.id} onDraft={applyDraft} /> : null}

          <Section title="The shift">
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Field label="Started" value={value("timeIn")} onChangeText={set("timeIn")} placeholder="15:00" maxLength={5} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Finished" value={value("timeOut")} onChangeText={set("timeOut")} placeholder="23:00" maxLength={5} />
              </View>
            </View>
            <T weight="medium" size={14}>
              Where support was given
            </T>
            <Chips options={form.lists.locations} value={value("location")} onChange={set("location")} />
            <T weight="medium" size={14}>
              Mood
            </T>
            <Chips options={form.lists.moods.map(mood => [mood, capital(mood)] as const)} value={value("mood")} onChange={set("mood")} />
            <Field label="How they presented (optional)" value={value("presentation")} onChangeText={set("presentation")} placeholder="Bright and chatty after lunch" maxLength={500} />
          </Section>

          {form.lists.requiredChecks.length ? (
            <Section title="Checks" hint="Confirm each one.">
              {form.lists.requiredChecks.map(check => (
                <Check key={check} checked={list("checks").includes(check)} onToggle={() => set("checks")(list("checks").includes(check) ? list("checks").filter(item => item !== check) : [...list("checks"), check])}>
                  {check}
                </Check>
              ))}
            </Section>
          ) : null}

          {on("care") ? (
            <Section title={title("care")} hint={required("care") ? "Required for this person." : "The support each task needed."} tone={required("care") ? "must" : undefined}>
              {form.lists.adlItems.map((item, index) => (
                <View key={item} style={{ gap: 8 }}>
                  <T weight="semibold">{item}</T>
                  <Chips options={[...form.lists.promptLevels, ...form.lists.adlExtra]} value={value(`adl.${index}`)} onChange={set(`adl.${index}`)} />
                </View>
              ))}
            </Section>
          ) : null}

          {on("meals") ? (
            <Section title={title("meals")} tone={required("meals") ? "must" : undefined} hint={required("meals") ? "Required for this person." : undefined}>
              {form.lists.meals.map(meal => (
                <View key={meal} style={{ gap: 8 }}>
                  <T weight="semibold">{meal}</T>
                  <Chips options={form.lists.intake} value={value(`meal.${meal}`)} onChange={set(`meal.${meal}`)} />
                </View>
              ))}
              <Area label="What they ate and drank" value={value("meals")} onChange={set("meals")} />
              <View style={styles.pair}>
                <Num label="Fluids" unit="oz" value={value("fluidsOz")} onChange={set("fluidsOz")} />
              </View>
            </Section>
          ) : null}

          {on("sleep") ? (
            <Section title={title("sleep")} tone={required("sleep") ? "must" : undefined}>
              <View style={styles.pair}>
                <Num label="Hours slept" value={value("sleepHours")} onChange={set("sleepHours")} />
              </View>
              <Chips options={form.lists.sleepQuality} value={value("sleepQuality")} onChange={set("sleepQuality")} />
              <Area label="Sleep and night checks" value={value("sleepNotes")} onChange={set("sleepNotes")} />
            </Section>
          ) : null}

          {on("continence") ? (
            <Section title={title("continence")} tone={required("continence") ? "must" : undefined}>
              <View style={styles.pair}>
                <Num label="Bowel movements" value={value("bowelMovements")} onChange={set("bowelMovements")} />
                <Num label="Incontinence" value={value("incontinence")} onChange={set("incontinence")} />
              </View>
              <Chips options={form.lists.stoolTypes} value={value("stoolType")} onChange={set("stoolType")} />
              <Area label="Notes" value={value("continenceNotes")} onChange={set("continenceNotes")} />
            </Section>
          ) : null}

          {on("vitals") ? (
            <Section title={title("vitals")} tone={required("vitals") ? "must" : undefined}>
              <View style={styles.pair}>
                <Num label="Blood pressure, upper" value={value("bpSys")} onChange={set("bpSys")} />
                <Num label="Lower" value={value("bpDia")} onChange={set("bpDia")} />
              </View>
              <View style={styles.pair}>
                <Num label="Pulse" value={value("pulse")} onChange={set("pulse")} />
                <Num label="Temperature" unit="°F" value={value("temp")} onChange={set("temp")} />
              </View>
              <View style={styles.pair}>
                <Num label="Weight" unit="lb" value={value("weight")} onChange={set("weight")} />
                <Num label="Pain" unit="0 to 10" value={value("pain")} onChange={set("pain")} />
              </View>
            </Section>
          ) : null}

          {on("seizure") ? (
            <Section title={title("seizure")} hint="Any seizure activity this shift?" tone={required("seizure") ? "must" : undefined}>
              <Chips options={[...YES_NO]} value={value("seizureAnswer")} onChange={set("seizureAnswer")} />
              {value("seizureAnswer") === "yes" ? <Area value={value("seizureNotes")} onChange={set("seizureNotes")} placeholder="When it started, how long it lasted, what it looked like and what you did" /> : null}
            </Section>
          ) : null}

          <Section title="Health">
            <Area value={value("health")} onChange={set("health")} placeholder="Medicines taken or refused, pain, injuries, symptoms" />
          </Section>

          {form.goals.length ? (
            <Section title="Plan goals" hint="Mark each goal for this shift.">
              {form.goals.map(goal => {
                const base = `goal.${goal.id}`;
                const offered = value(`${base}.offered`) || "no";
                return (
                  <View key={goal.id} style={styles.goal}>
                    <T weight="bold">{goal.title}</T>
                    {goal.measurableStep ? (
                      <T size={13} color={colors.mute}>
                        {goal.measurableStep}
                      </T>
                    ) : null}
                    <T size={12} color={colors.sage}>
                      {goal.progress}
                    </T>
                    <Chips options={Object.entries(form.lists.goalOffered).map(([key, words]) => [key, words] as const)} value={offered} onChange={set(`${base}.offered`)} />
                    {offered === "yes" ? (
                      <>
                        <T weight="medium" size={14}>
                          Support needed
                        </T>
                        <Chips options={form.lists.promptLevels} value={value(`${base}.prompt`)} onChange={set(`${base}.prompt`)} />
                        <T weight="medium" size={14}>
                          How it went
                        </T>
                        <Chips options={Object.entries(form.lists.goalOutcome).map(([key, words]) => [key, words] as const)} value={value(`${base}.outcome`)} onChange={set(`${base}.outcome`)} />
                        <View style={styles.pair}>
                          <Num label="Attempts" value={value(`${base}.attempts`)} onChange={set(`${base}.attempts`)} />
                          <Num label="Successes" value={value(`${base}.successes`)} onChange={set(`${base}.successes`)} />
                        </View>
                      </>
                    ) : null}
                  </View>
                );
              })}
              <Area label="Goal notes" value={value("goalProgress")} onChange={set("goalProgress")} />
            </Section>
          ) : null}

          {on("activities") ? (
            <Section title={title("activities")} tone={required("activities") ? "must" : undefined}>
              <Chips multi options={form.lists.activityTypes} value={list("activityTypes")} onChange={set("activityTypes")} />
              <Area value={value("activities")} onChange={set("activities")} placeholder="What they did, in and out of the home" />
            </Section>
          ) : null}

          {on("behaviour") ? (
            <Section title={title("behaviour")} hint="Any behaviour of concern this shift?" tone={required("behaviour") ? "must" : undefined}>
              <Chips options={[...YES_NO]} value={value("behaviourAnswer")} onChange={set("behaviourAnswer")} />
              {behaviourYes ? (
                <>
                  <Area label="What happened just before" value={value("antecedent")} onChange={set("antecedent")} />
                  <Area label="The behaviour: what you saw and heard, and how long" value={value("behaviours")} onChange={set("behaviours")} />
                  <Area label="What staff did" value={value("intervention")} onChange={set("intervention")} />
                  <Area label="How it ended" value={value("behaviourOutcome")} onChange={set("behaviourOutcome")} />
                </>
              ) : null}
            </Section>
          ) : null}

          {on("contacts") ? (
            <Section title={title("contacts")} tone={required("contacts") ? "must" : undefined}>
              <Area label="Family or guardian contact" value={value("familyContact")} onChange={set("familyContact")} />
              <Area label="Appointments" value={value("appointments")} onChange={set("appointments")} />
            </Section>
          ) : null}

          {form.items.length ? (
            <Section title="Also for this person">
              {form.items.map(item => {
                const name = `extra.${item.id}`;
                const answer = value(name);
                return (
                  <View key={item.id} style={{ gap: 8 }}>
                    <T weight="semibold">
                      {item.label}
                      {item.required ? <T color={colors.flag}> *</T> : null}
                    </T>
                    {item.help ? (
                      <T size={13} color={colors.mute}>
                        {item.help}
                      </T>
                    ) : null}
                    {item.fieldType === "yes_no" ? <Chips options={["Yes", "No"]} value={answer} onChange={set(name)} /> : null}
                    {item.fieldType === "choice" ? <Chips options={item.options} value={answer} onChange={set(name)} /> : null}
                    {item.fieldType === "multi" ? <Chips multi options={item.options} value={list(name)} onChange={set(name)} /> : null}
                    {item.fieldType === "number" ? (
                      <View style={styles.pair}>
                        <Num label="Amount" unit={item.unit || undefined} value={answer} onChange={set(name)} />
                      </View>
                    ) : null}
                    {item.fieldType === "text" ? <Area value={answer} onChange={set(name)} /> : null}
                    {item.followUpOn && answer === item.followUpOn ? (
                      <View style={styles.followUp}>
                        <Area label={item.followUpPrompt || "Explain your answer"} value={value(`${name}.followUp`)} onChange={set(`${name}.followUp`)} />
                        {item.followUpDocs.map(doc => (
                          <Check key={doc} checked={list(`${name}.doc`).includes(doc)} onToggle={() => set(`${name}.doc`)(list(`${name}.doc`).includes(doc) ? list(`${name}.doc`).filter(item => item !== doc) : [...list(`${name}.doc`), doc])}>
                            {`Done: ${doc}`}
                          </Check>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Section>
          ) : null}

          {on("timeline") && form.timeline.length ? (
            <Section title={title("timeline")} hint={required("timeline") ? "A line for every hour is required for this person." : "A line for each hour of the shift."} tone={required("timeline") ? "must" : undefined}>
              {form.timeline.map(slot => (
                <View key={slot.hour} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <T weight="bold" size={14} style={{ width: 52 }}>
                      {hourLabel(slot.hour)}
                    </T>
                    <View style={{ flex: 1, gap: 2 }}>
                      {slot.meds.map(med => (
                        <T key={med} size={12} color="#9a6212">
                          {med}
                        </T>
                      ))}
                    </View>
                  </View>
                  <TextInput value={value(`timeline.${slot.hour}`)} onChangeText={set(`timeline.${slot.hour}`)} maxLength={500} placeholder="What happened this hour" placeholderTextColor={colors.dim} style={ui.field} />
                </View>
              ))}
            </Section>
          ) : null}

          <Section title="Shift summary" hint={`How the shift went, at least ${form.summaryMin} characters.`} tone={summaryLength >= form.summaryMin ? "good" : "must"}>
            <Area value={value("notes")} onChange={set("notes")} placeholder="Two to four sentences on how the whole shift went." hint={`${summaryLength} of at least ${form.summaryMin} characters`} />
          </Section>

          <Section title="Sign">
            <Check checked={value("attest") === "on"} onToggle={() => set("attest")(value("attest") === "on" ? "" : "on")}>
              {`This note is accurate and complete. I am signing it as ${me?.user.name ?? "myself"}.`}
            </Check>
          </Section>

          <ErrorText>{error}</ErrorText>
          <Button label="Sign and save" icon="check" busy={busy} onPress={save} style={styles.go} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bar() {
  return (
    <SafeAreaView edges={["top"]} style={styles.bar}>
      <StatusBar style="dark" />
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBack()} style={styles.back}>
        <Icon name="chevron-left" size={22} />
      </Pressable>
      <T weight="bold" size={17}>
        Shift note
      </T>
      <View style={{ width: 40 }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  page: { padding: 20, paddingTop: 8, gap: 14, paddingBottom: 60 },
  person: { backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 4 },
  allergy: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: colors.flagSoft, borderRadius: 10, padding: 8 },
  pair: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  goal: { backgroundColor: colors.ground, borderRadius: 16, padding: 14, gap: 8 },
  followUp: { backgroundColor: colors.ground, borderRadius: 14, padding: 12, gap: 8 },
  go: { minHeight: 56, borderRadius: 18 },
});
