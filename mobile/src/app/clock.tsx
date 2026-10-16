import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Check, Choice, ErrorText, Field, Icon, Section, styles as ui, T } from "@/components/ui";
import { ApiError, type ClockScreen } from "@/lib/api";
import { fmt } from "@/lib/format";
import { combineHandovers } from "@/lib/handover";
import { distanceWords, locationVerdict, readPosition, type Reading } from "@/lib/location";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

type Off = Extract<ClockScreen, { state: "off" }>;
type On = Extract<ClockScreen, { state: "on" }>;

const minutesWords = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`);

/* Clocking in, or clocking out with the handover. The server checks every rule again. */
export default function ClockScreenPage() {
  const { call } = useSession();
  const [data, setData] = useState<ClockScreen | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      call<ClockScreen>("/clock").then(setData, problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.")),
    [call],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const title = data?.state === "on" ? "Clock out" : "Clock in";
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <StatusBar style="dark" />
      <SafeAreaView edges={["top"]} style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBack()} style={styles.back}>
          <Icon name="chevron-left" size={22} />
        </Pressable>
        <T weight="bold" size={17}>
          {data ? title : ""}
        </T>
        <View style={{ width: 40 }} />
      </SafeAreaView>
      {!data ? (
        <View style={{ padding: 20 }}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.brand} />}</View>
      ) : data.state === "none" ? (
        <View style={{ padding: 20 }}>
          <ErrorText>Your login is not linked to a staff record, so you cannot clock in. Ask your office.</ErrorText>
        </View>
      ) : data.state === "off" ? (
        <ClockIn data={data} />
      ) : (
        <ClockOut data={data} />
      )}
    </View>
  );
}

/* Where the phone is, compared with the home. */
function useReading() {
  const [reading, setReading] = useState<Reading | "reading">("reading");
  const read = useCallback(() => {
    setReading("reading");
    readPosition().then(setReading);
  }, []);
  useEffect(() => {
    readPosition().then(setReading);
  }, []);
  return { reading, read };
}

function LocationBlock({ reading, retry, home, homeName, radius, reason, setReason, verb }: { reading: Reading | "reading"; retry: () => void; home: { latitude: number | null; longitude: number | null } | null; homeName: string; radius: number; reason: string; setReason: (value: string) => void; verb: string }) {
  if (reading === "reading")
    return (
      <Section title="Where you are">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={colors.brand} />
          <T color={colors.mute}>Finding your location…</T>
        </View>
      </Section>
    );
  const verdict = locationVerdict(home, reading.position, radius);
  if (verdict.state === "ok")
    return (
      <Section title="Where you are" tone="good">
        <View style={styles.line}>
          <Icon name="check-circle" size={18} color={colors.sage} />
          <T>You are at {homeName}.</T>
        </View>
      </Section>
    );
  if (verdict.state === "home_not_set")
    return (
      <Section title="Where you are">
        <T color={colors.mute}>{homeName} has no location set, so it is not checked. Your office can add it on the website.</T>
      </Section>
    );
  if (verdict.state === "unavailable")
    return (
      <Section title="Where you are" tone="warn" hint={reading.error}>
        <Button label="Try again" tone="ghost" icon="refresh-cw" onPress={retry} />
      </Section>
    );
  return (
    <Section title="Where you are" tone="must" hint={`You are about ${distanceWords(verdict.distance ?? 0)} from ${homeName}. Move closer and try again, or say why you are ${verb} from here.`}>
      <Field label="Why you are not at the home" value={reason} onChangeText={setReason} placeholder="Taking James to his appointment" maxLength={500} />
      <Button label="Check again" tone="ghost" icon="refresh-cw" onPress={retry} />
    </Section>
  );
}

function ClockIn({ data }: { data: Off }) {
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const { reading, read } = useReading();
  const [homeId, setHomeId] = useState(data.shift?.homeId ?? "");
  const [working, setWorking] = useState(Boolean(data.shift));
  const [reason, setReason] = useState("");
  const [statements, setStatements] = useState<string[]>([]);
  const [read_, setRead] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needs = data.rules.requirements;
  const home = data.homes.find(item => item.id === homeId) ?? null;
  const handovers = needs.includes("handover") ? data.handovers.filter(handover => handover.homeId === homeId) : [];
  // However many handed over, one combined handover to read and acknowledge once.
  const combined = combineHandovers(handovers);
  const allRead = handovers.every(handover => read_.includes(handover.id));
  const [remark, setRemark] = useState("");
  const [now] = useState(() => Date.now());

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const position = reading === "reading" ? null : reading.position;
      await call("/clock/in", { shiftId: data.shift?.id ?? null, homeId: data.shift ? null : homeId, position, reason, statements, handoversRead: read_, handoverRemark: remark.trim() });
      goBack();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {data.shift ? (
          <View style={[styles.hero, shadow.soft]}>
            <T weight="semibold" size={12} color={colors.mute} style={{ letterSpacing: 1 }}>
              YOUR SHIFT
            </T>
            <T weight="bold" size={22} style={{ marginTop: 6, letterSpacing: -0.5 }}>
              {fmt.time(data.shift.startsAt, zone)} – {fmt.time(data.shift.endsAt, zone)}
            </T>
            <T color={colors.mute}>
              {data.shift.home}
              {new Date(data.shift.startsAt).getTime() > now ? ` · starts in ${minutesWords(Math.ceil((new Date(data.shift.startsAt).getTime() - now) / 60_000))}` : ` · started ${minutesWords(Math.floor((now - new Date(data.shift.startsAt).getTime()) / 60_000))} ago`}
            </T>
          </View>
        ) : (
          <Section title="No shift to clock in to" hint={data.next ? `Your next shift is ${fmt.dayShort(data.next.startsAt, zone)} at ${fmt.time(data.next.startsAt, zone)}, at ${data.next.home}. You can clock in ${data.rules.earlyMinutes} minutes before it starts.` : "There is no shift on your schedule."}>
            {working ? (
              <>
                <T weight="semibold">Which home are you working at?</T>
                <Choice value={homeId} options={data.homes.map(item => [item.id, item.name])} onChange={setHomeId} />
                <Field label="Why you are working without a scheduled shift" value={reason} onChangeText={setReason} placeholder="Covering for Devon, agreed with the manager" maxLength={500} />
              </>
            ) : (
              <Button label="Work without a shift" tone="ghost" icon="plus" onPress={() => setWorking(true)} />
            )}
          </Section>
        )}

        {working && home && needs.includes("location") ? <LocationBlock reading={reading} retry={read} home={home} homeName={home.name} radius={data.rules.geofence} reason={reason} setReason={setReason} verb="clocking in" /> : null}

        {working && handovers.length ? (
          <Section title="Handover from the last shift" hint={`From ${combined.from.join(", ")}. Read it, then acknowledge it once.`} tone={allRead ? "good" : "must"}>
            {combined.incidents.map(incident => (
              <View key={incident.staff} style={[styles.callout, { backgroundColor: incident.reported ? "#fdf0dc" : colors.flagSoft }]}>
                <T size={13} weight="semibold" color={incident.reported ? "#9a6212" : colors.flag}>
                  {incident.staff}: {incident.reported ? "an incident happened and was reported." : "an incident happened and is not reported yet."}
                </T>
              </View>
            ))}
            {combined.notes.map(entry => (
              <View key={entry.staff + String(entry.at)} style={{ gap: 2 }}>
                <T size={12} weight="semibold" color={colors.mute}>
                  {entry.staff} · {fmt.time(entry.at, zone)}
                </T>
                <T>{entry.note}</T>
              </View>
            ))}
            {combined.people.map(person => (
              <T key={person.name} size={14}>
                <T weight="semibold" size={14}>
                  {person.name}:
                </T>{" "}
                {person.notes.map(note => (combined.from.length > 1 ? `${note.note} (${note.staff})` : note.note)).join(" · ")}
              </T>
            ))}
            {combined.checks.length ? (
              <View style={styles.handover}>
                {combined.checks.map(check => (
                  <View key={check.label} style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                    <Icon name={check.notDone.length ? "x-circle" : "check-circle"} size={16} color={check.notDone.length ? colors.flag : colors.sage} />
                    <View style={{ flex: 1 }}>
                      <T size={14} weight={check.notDone.length ? "semibold" : "regular"} color={check.notDone.length ? colors.flag : colors.ink}>
                        {check.label}
                      </T>
                      {check.notDone.map(miss => (
                        <T key={miss.staff} size={13} color={colors.ink}>
                          Not done by {miss.staff}
                          {miss.comment ? `: ${miss.comment}` : ""}
                        </T>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            <Check checked={allRead} onToggle={() => setRead(allRead ? [] : handovers.map(handover => handover.id))}>
              {handovers.length === 1 ? "I have read this handover" : `I have read the handover from all ${handovers.length}`}
            </Check>
            <Field label="Anything not as handed over? (optional)" value={remark} onChangeText={setRemark} placeholder="Fridge was not cleaned" maxLength={1000} />
            <T size={12} color={colors.mute}>
              Your manager and whoever handed over will see it.
            </T>
          </Section>
        ) : null}

        {working && needs.includes("statements") && data.rules.statements.length ? (
          <Section title="Before you start" tone={data.rules.statements.every(statement => statements.includes(statement)) ? "good" : "must"}>
            {data.rules.statements.map(statement => (
              <Check key={statement} checked={statements.includes(statement)} onToggle={() => setStatements(statements.includes(statement) ? statements.filter(item => item !== statement) : [...statements, statement])}>
                {statement}
              </Check>
            ))}
          </Section>
        ) : null}

        {working ? (
          <>
            <ErrorText>{error}</ErrorText>
            <Button label="Clock in" icon="log-in" busy={busy} onPress={submit} style={styles.go} />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const INCIDENT: ["none" | "reported" | "not_reported", string][] = [
  ["none", "No incident this shift"],
  ["reported", "Yes, and I reported it"],
  ["not_reported", "Yes, not reported yet"],
];

function ClockOut({ data }: { data: On }) {
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const { reading, read } = useReading();
  const must = (key: On["rules"]["blocking"][number]) => data.rules.blocking.includes(key);
  const [note, setNote] = useState("");
  const [personNotes, setPersonNotes] = useState<Record<string, string>>({});
  const [showPeople, setShowPeople] = useState(false);
  const [checks, setChecks] = useState<Record<string, { done: boolean; comment: string }>>({});
  const [incident, setIncident] = useState<"none" | "reported" | "not_reported">("none");
  const [stayReason, setStayReason] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [signed, setSigned] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const notesMissing = data.people.filter(person => !person.noteWritten);
  const dosesMissing = data.people.flatMap(person => person.dosesDue.map(dose => ({ ...dose, person: person.name })));
  const blocked = (must("notes") && notesMissing.length > 0) || (must("doses") && dosesMissing.length > 0);
  const warnings = notesMissing.length + dosesMissing.length + (incident === "not_reported" ? 1 : 0);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const position = reading === "reading" ? null : reading.position;
      await call("/clock/out", {
        position,
        reason,
        note,
        people: Object.entries(personNotes)
          .filter(([, text]) => text.trim())
          .map(([individualId, text]) => ({ individualId, note: text })),
        checks: data.checklist.map(label => ({ label, done: checks[label]?.done ?? false, comment: checks[label]?.comment ?? "" })),
        incident,
        overstayReason: stayReason,
        attestedName: signed,
        confirmWarnings: confirm,
      });
      goBack();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, shadow.soft, styles.summary]}>
          {[
            ["Clocked in", fmt.time(data.entry.clockInAt, zone)],
            ["Shift ends", data.entry.shiftEndsAt ? fmt.time(data.entry.shiftEndsAt, zone) : "—"],
            ["Worked", minutesWords(data.worked)],
          ].map(([label, value], index) => (
            <View key={label} style={[styles.summaryItem, index > 0 && styles.summaryRule]}>
              <T size={12} color={colors.mute}>
                {label}
              </T>
              <T weight="bold" size={17} style={{ letterSpacing: -0.3 }}>
                {value}
              </T>
            </View>
          ))}
        </View>

        {notesMissing.length || dosesMissing.length ? (
          <Section title="Still to do" tone={blocked ? "must" : "warn"} hint={blocked ? "Finish these before you can clock out." : "You can still clock out. Your manager will see what was left."}>
            {notesMissing.map(person => (
              <View key={person.id} style={styles.line}>
                <Icon name="edit-3" size={16} color={colors.skyInk} />
                <T style={{ flex: 1 }}>Shift note for {person.name}</T>
              </View>
            ))}
            {dosesMissing.map(dose => (
              <View key={`${dose.person}-${dose.medication}-${dose.scheduledFor}`} style={styles.line}>
                <Icon name="droplet" size={16} color="#9a6212" />
                <T style={{ flex: 1 }}>
                  {dose.person}: {dose.medication}, {fmt.time(dose.scheduledFor, zone)}
                </T>
              </View>
            ))}
          </Section>
        ) : null}

        {data.entry.hasHome ? (
          <Section title={`Handover for the next shift at ${data.entry.home ?? "the home"}`} hint="The next person reads this before they can clock in." tone={must("handover") ? (note.trim().length >= Math.max(1, data.rules.minChars) ? "good" : "must") : undefined}>
            <TextInput
              multiline
              value={note}
              onChangeText={setNote}
              maxLength={4000}
              placeholder="Quiet evening. Brianna had a headache after dinner, gave water and rest, fine by 8pm."
              placeholderTextColor={colors.dim}
              style={[ui.field, ui.area]}
            />
            {must("handover") && data.rules.minChars > 1 ? (
              <T size={12} color={note.trim().length >= data.rules.minChars ? colors.sage : colors.mute}>
                {note.trim().length} of at least {data.rules.minChars} characters
              </T>
            ) : null}
            {data.people.length ? (
              showPeople ? (
                <View style={{ gap: 10 }}>
                  {data.people.map(person => (
                    <Field key={person.id} label={person.name} value={personNotes[person.id] ?? ""} onChangeText={text => setPersonNotes({ ...personNotes, [person.id]: text })} placeholder="Appointment tomorrow at 9" maxLength={1000} />
                  ))}
                </View>
              ) : (
                <Button label="Add a note about one person" tone="ghost" icon="user-plus" onPress={() => setShowPeople(true)} />
              )
            ) : null}
          </Section>
        ) : null}

        {data.entry.hasHome && data.checklist.length ? (
          <Section title="Handover ticks" hint="Tick each one, or say why it was not done." tone={must("checks") ? (data.checklist.every(label => checks[label]?.done || (checks[label]?.comment ?? "").trim().length >= 3) ? "good" : "must") : undefined}>
            {data.checklist.map(label => {
              const check = checks[label] ?? { done: false, comment: "" };
              return (
                <View key={label}>
                  <Check checked={check.done} onToggle={() => setChecks({ ...checks, [label]: { ...check, done: !check.done } })}>
                    {label}
                  </Check>
                  {!check.done ? (
                    <TextInput value={check.comment} onChangeText={comment => setChecks({ ...checks, [label]: { ...check, comment } })} placeholder="Not done because…" placeholderTextColor={colors.dim} maxLength={500} style={[ui.field, styles.why]} />
                  ) : null}
                </View>
              );
            })}
          </Section>
        ) : null}

        {data.entry.hasHome ? (
          <Section title="Incidents" tone={incident === "not_reported" ? (must("incident") ? "must" : "warn") : undefined} hint={incident === "not_reported" ? (must("incident") ? "Report it on the website first, then choose \"Yes, and I reported it\"." : "Your manager will be told it is not reported yet.") : undefined}>
            <Choice value={incident} options={INCIDENT} onChange={setIncident} />
          </Section>
        ) : null}

        {data.leftEarly > 0 || data.overstay > 0 ? (
          <Section title={data.leftEarly > 0 ? "You are leaving early" : "You stayed late"} tone="must" hint={data.leftEarly > 0 ? `Your shift ends in ${minutesWords(data.leftEarly)}.` : `You are ${minutesWords(data.overstay)} past the end of your shift.`}>
            <Field label={data.leftEarly > 0 ? "Why you are leaving early" : "Why you stayed"} value={stayReason} onChangeText={setStayReason} placeholder={data.leftEarly > 0 ? "Relieved early by the night staff; manager agreed" : "Waited for the night staff, who was 30 minutes late"} maxLength={500} />
          </Section>
        ) : null}

        {data.rules.location && data.entry.hasHome ? <LocationBlock reading={reading} retry={read} home={data.homePoint} homeName={data.entry.home ?? "the home"} radius={data.rules.geofence} reason={reason} setReason={setReason} verb="clocking out" /> : null}

        <Section title="Sign off" hint="My times are accurate, I took the breaks I recorded, and the handover is true.">
          {warnings > 0 && !blocked ? (
            <Check checked={confirm} onToggle={() => setConfirm(!confirm)}>
              I know some things above are not done. My manager will see them with this punch.
            </Check>
          ) : null}
          <Field label="Type your full name to sign" value={signed} onChangeText={setSigned} placeholder={data.fullName} autoCapitalize="words" autoCorrect={false} />
        </Section>

        <ErrorText>{error}</ErrorText>
        <Button label="Clock out now" icon="log-out" busy={busy} onPress={submit} style={styles.go} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  page: { padding: 20, paddingTop: 8, gap: 14, paddingBottom: 48 },
  hero: { backgroundColor: colors.card, borderRadius: 24, padding: 18 },
  summary: { flexDirection: "row", paddingHorizontal: 0, paddingVertical: 14 },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  summaryRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
  line: { flexDirection: "row", alignItems: "center", gap: 10 },
  handover: { backgroundColor: colors.ground, borderRadius: 16, padding: 12 },
  callout: { borderRadius: 12, padding: 10 },
  why: { minHeight: 42, marginLeft: 36, marginTop: 2, marginBottom: 6, fontSize: 14 },
  go: { minHeight: 56, borderRadius: 18 },
});
