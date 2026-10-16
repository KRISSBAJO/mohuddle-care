import { useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Chips, ErrorText, Icon, styles as ui, T } from "@/components/ui";
import { ApiError, type DoseResult, type DoseStatus, type MedRound } from "@/lib/api";
import { fmt } from "@/lib/format";
import { queueDose, queuedDoses, sendQueued, type Queued } from "@/lib/outbox";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

type Dose = MedRound["doses"][number];
const WORDS: Record<DoseStatus, string> = { given: "Given", refused: "Refused", missed: "Missed", held: "Held" };

/*
 * The medicine round at your home: each dose due today, marked Given, Refused, Missed or Held.
 * With no signal a regular dose is saved on the phone and sent when the signal is back; controlled
 * medicines need a signal so the latest record is always seen first.
 */
export default function MedsScreen() {
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const owner = `${me?.user.email}|${me?.agency?.id}`;
  const [round, setRound] = useState<MedRound | null>(null);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Queued[]>([]);
  const [refused, setRefused] = useState<{ label: string; error: string }[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ id: string; status: DoseStatus } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const send = useCallback((doses: Queued[]) => call<{ results: DoseResult[] }>("/meds/record", { doses: doses.map(({ adminId, status, note: text, at }) => ({ adminId, status, note: text, at })), offline: true }).then(result => result.results), [call]);

  // Sends anything saved with no signal, then loads the round.
  const load = useCallback(async () => {
    const outcome = await sendQueued(owner, send);
    if (outcome?.refused.length) setRefused(previous => [...previous, ...outcome.refused.map(item => ({ label: item.label, error: item.error }))]);
    setWaiting(await queuedDoses(owner));
    try {
      setRound(await call<MedRound>(`/meds${homeId ? `?home=${homeId}` : ""}`));
      setError("");
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    }
    setNow(Date.now());
  }, [call, homeId, owner, send]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // Try again every half minute, so saved doses go out soon after the signal comes back.
  useEffect(() => {
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function record(dose: Dose, status: DoseStatus, text: string) {
    setBusy(dose.id);
    const person = round?.people.find(item => item.id === dose.individualId)?.name ?? "";
    const label = `${person}: ${dose.medication} ${dose.dose}, ${fmt.time(dose.scheduledFor, zone)}`;
    try {
      const { results } = await call<{ results: DoseResult[] }>("/meds/record", { doses: [{ adminId: dose.id, status, note: text }] });
      const result = results[0];
      if (!result.ok) setRefused(previous => [...previous, { label, error: result.error }]);
      setOpen(null);
      setNote("");
      await load();
    } catch (problem) {
      if (problem instanceof ApiError && problem.code === "offline") {
        if (dose.controlled) {
          setError("No signal. Controlled medicines need a signal, so the latest record is seen first. Try again when you have one.");
        } else {
          await queueDose({ adminId: dose.id, status, note: text, at: new Date().toISOString(), owner, label });
          setWaiting(await queuedDoses(owner));
          setOpen(null);
          setNote("");
        }
      } else {
        setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  // As needed: always live, never saved for later, so the latest record is always seen first.
  const [prnOpen, setPrnOpen] = useState<string | null>(null);
  const [prnReason, setPrnReason] = useState("");
  const [effectOpen, setEffectOpen] = useState<string | null>(null);
  const [effectText, setEffectText] = useState("");

  async function givePrn(medicationId: string) {
    setBusy(medicationId);
    setError("");
    try {
      await call("/meds/as-needed", { medicationId, reason: prnReason });
      setPrnOpen(null);
      setPrnReason("");
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? (problem.code === "offline" ? "No signal. As-needed medicines need a signal, so the latest record is seen first. Try again when you have one." : problem.message) : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveEffect(adminId: string) {
    setBusy(adminId);
    setError("");
    try {
      await call("/meds/effect", { adminId, effect: effectText });
      setEffectOpen(null);
      setEffectText("");
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const doses = round?.doses ?? [];
  const pending = (dose: Dose) => waiting.find(item => item.adminId === dose.id);
  const isDone = (dose: Dose) => dose.status !== "due" || Boolean(pending(dose));
  const dueNow = doses.filter(dose => !isDone(dose) && new Date(dose.scheduledFor).getTime() <= now);
  const later = doses.filter(dose => !isDone(dose) && new Date(dose.scheduledFor).getTime() > now);
  const done = doses.filter(isDone);
  const late = (dose: Dose) => new Date(dose.scheduledFor).getTime() < now - (round?.lateMinutes ?? 60) * 60_000;
  const person = (dose: Dose) => round?.people.find(item => item.id === dose.individualId);

  // A plain function, not a component, so the note box keeps its focus while typing.
  function doseCard(dose: Dose, actions: boolean) {
    const saved = pending(dose);
    const status = saved?.status ?? (dose.status === "due" ? null : dose.status);
    const who = person(dose);
    return (
      <View style={styles.dose}>
        <View style={styles.doseTop}>
          <View style={{ flex: 1 }}>
            <T weight="bold" size={15}>
              {who?.name}
            </T>
            <T weight="semibold" size={15}>
              {dose.medication} {dose.dose}
            </T>
            <T size={13} color={colors.mute}>
              {dose.route}
              {dose.instructions ? ` · ${dose.instructions}` : ""}
            </T>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <T weight="semibold" size={13} color={!status && late(dose) ? colors.flag : colors.ink}>
              {fmt.dayShort(dose.scheduledFor, zone) === fmt.dayShort(new Date(now), zone) ? "" : `${fmt.dayShort(dose.scheduledFor, zone)}, `}
              {fmt.time(dose.scheduledFor, zone)}
            </T>
            {!status && late(dose) ? <Tag text="Late" bg={colors.flagSoft} fg={colors.flag} /> : null}
            {dose.controlled ? <Tag text="Controlled" bg="#efe8fa" fg="#5b3f9a" /> : null}
          </View>
        </View>
        {who?.allergies ? (
          <T size={12} color={colors.flag}>
            Allergies: {who.allergies}
          </T>
        ) : null}
        {saved ? (
          <View style={[styles.state, { backgroundColor: "#fdf0dc" }]}>
            <Icon name="upload-cloud" size={14} color="#9a6212" />
            <T size={13} color="#9a6212" style={{ flex: 1 }}>
              {WORDS[saved.status]} {fmt.time(saved.at, zone)} · saved on this phone, waiting to send
            </T>
          </View>
        ) : status ? (
          <View style={[styles.state, { backgroundColor: status === "given" ? colors.sageSoft : "#eef0ec" }]}>
            <Icon name={status === "given" ? "check" : "minus-circle"} size={14} color={status === "given" ? colors.sage : colors.mute} />
            <T size={13} color={status === "given" ? colors.sage : colors.mute} style={{ flex: 1 }}>
              {WORDS[status]}
              {dose.recordedAt ? ` ${fmt.time(dose.recordedAt, zone)}` : ""}
              {dose.by ? ` by ${dose.by}` : ""}
              {dose.note ? ` · ${dose.note}` : ""}
            </T>
          </View>
        ) : actions ? (
          <>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={busy === dose.id} onPress={() => record(dose, "given", "")} style={[styles.action, styles.give]}>
                <T weight="semibold" color="#ffffff">
                  {busy === dose.id ? "Saving…" : "Given"}
                </T>
              </Pressable>
              {(["refused", "missed", "held"] as const).map(status => (
                <Pressable key={status} accessibilityRole="button" onPress={() => setOpen(open?.id === dose.id && open.status === status ? null : { id: dose.id, status })} style={[styles.action, open?.id === dose.id && open.status === status && { borderColor: colors.brand, backgroundColor: colors.wash }]}>
                  <T weight="semibold" size={14}>
                    {WORDS[status]}
                  </T>
                </Pressable>
              ))}
            </View>
            {open?.id === dose.id ? (
              <View style={{ gap: 8 }}>
                <TextInput value={note} onChangeText={setNote} maxLength={500} placeholder={open.status === "refused" ? "What they said, and what you tried" : open.status === "held" ? "Why it was held, and who decided" : "Why it was missed"} placeholderTextColor={colors.dim} style={ui.field} />
                <Pressable accessibilityRole="button" disabled={busy === dose.id} onPress={() => record(dose, open.status, note)} style={[styles.action, styles.give, { flex: 0 }]}>
                  <T weight="semibold" color="#ffffff">
                    Record as {WORDS[open.status].toLowerCase()}
                  </T>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    );
  }

  const section = (title: string, list: Dose[], actions: boolean) =>
    list.length ? (
      <>
        <T weight="bold" size={18} style={styles.head}>
          {title}
        </T>
        <View style={[styles.group, shadow.soft]}>
          {list.map((dose, index) => (
            <Fragment key={dose.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              {doseCard(dose, actions)}
            </Fragment>
          ))}
        </View>
      </>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        <SafeAreaView edges={["top"]} style={styles.header}>
          <T weight="bold" size={24} style={{ letterSpacing: -0.6 }}>
            Medicines
          </T>
          <T size={14} color={colors.mute}>
            {round?.home ? `${round.home.name} · ${fmt.dayLong(new Date(now), zone)}` : " "}
          </T>
        </SafeAreaView>

        {waiting.length ? (
          <View style={[styles.banner, { backgroundColor: "#fdf0dc" }]}>
            <Icon name="wifi-off" size={16} color="#9a6212" />
            <T size={13} color="#9a6212" style={{ flex: 1 }}>
              {waiting.length} {waiting.length === 1 ? "dose is" : "doses are"} saved on this phone. They are sent as soon as there is a signal, and checked so no dose is recorded twice.
            </T>
          </View>
        ) : null}
        {refused.map((item, index) => (
          <View key={`${item.label}-${index}`} style={[styles.banner, { backgroundColor: colors.flagSoft }]}>
            <Icon name="alert-triangle" size={16} color={colors.flag} />
            <View style={{ flex: 1 }}>
              <T size={13} weight="semibold" color={colors.flag}>
                Not recorded: {item.label}
              </T>
              <T size={13} color={colors.flag}>
                {item.error}
              </T>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => setRefused(refused.filter((_, i) => i !== index))}>
              <Icon name="x" size={16} color={colors.flag} />
            </Pressable>
          </View>
        ))}
        {error ? (
          <View style={{ marginHorizontal: 20, marginBottom: 10 }}>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : null}

        {round && !round.home ? (
          <View style={[styles.group, { padding: 16, gap: 12 }, shadow.soft]}>
            <T weight="semibold">Which home are you at?</T>
            <T size={13} color={colors.mute}>
              You are not clocked in or on shift at a home right now.
            </T>
            <Chips options={round.homes.map(home => [home.id, home.name] as const)} value={homeId ?? ""} onChange={next => setHomeId(typeof next === "string" && next ? next : null)} />
          </View>
        ) : null}

        {round?.home && doses.length === 0 && !round.prn.length ? (
          <View style={[styles.group, { padding: 24, alignItems: "center" }, shadow.soft]}>
            <Icon name="check-circle" size={22} color={colors.sage} />
            <T weight="semibold" style={{ marginTop: 8 }}>
              No medicines today
            </T>
          </View>
        ) : null}

        {section(dueNow.length ? `Due now (${dueNow.length})` : "Due now", dueNow, true)}

        {round?.prn.length ? (
          <>
            <T weight="bold" size={18} style={styles.head}>
              As needed
            </T>
            <View style={[styles.group, shadow.soft]}>
              {round.prn.map((med, index) => {
                const who = round.people.find(item => item.id === med.individualId);
                const waitUntil = med.nextAllowedAt && new Date(med.nextAllowedAt).getTime() > now ? med.nextAllowedAt : null;
                return (
                  <Fragment key={med.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.dose}>
                      <View style={styles.doseTop}>
                        <View style={{ flex: 1 }}>
                          <T weight="bold" size={15}>
                            {who?.name}
                          </T>
                          <T weight="semibold" size={15}>
                            {med.name} {med.dose}
                          </T>
                          <T size={13} color="#5b3f9a">
                            {[med.prnUse, med.prnMinHours ? `at least ${med.prnMinHours} h apart` : null, med.prnMaxPerDay ? `up to ${med.prnMaxPerDay} a day` : null].filter(Boolean).join(" · ")}
                          </T>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 4 }}>
                          <Tag text="As needed" bg="#efe8fa" fg="#5b3f9a" />
                          {med.controlled ? <Tag text="Controlled" bg={colors.flagSoft} fg={colors.flag} /> : null}
                        </View>
                      </View>
                      <T size={13} color={colors.mute}>
                        Given {med.givenToday} {med.givenToday === 1 ? "time" : "times"} in the last 24 hours.
                      </T>
                      {med.recent.map(given => {
                        const effectDue = now - new Date(given.at).getTime() >= (round.effectMinutes ?? 60) * 60_000;
                        return (
                          <View key={given.id} style={[styles.state, { backgroundColor: colors.ground, flexDirection: "column", alignItems: "stretch", gap: 6 }]}>
                            <T size={13}>
                              <T weight="semibold" size={13}>
                                {fmt.time(given.at, zone)}
                              </T>
                              {` · ${given.by ?? "staff"} · ${given.reason}`}
                            </T>
                            {given.effect ? (
                              <T size={13} color={colors.sage}>
                                Effect: {given.effect}
                              </T>
                            ) : effectDue ? (
                              effectOpen === given.id ? (
                                <View style={{ gap: 6 }}>
                                  <TextInput value={effectText} onChangeText={setEffectText} maxLength={500} placeholder="How did it work? Pain down to 2 out of 10" placeholderTextColor={colors.dim} style={ui.field} />
                                  <Pressable accessibilityRole="button" disabled={busy === given.id} onPress={() => saveEffect(given.id)} style={[styles.action, styles.give, { flex: 0 }]}>
                                    <T weight="semibold" color="#ffffff">
                                      Save how it worked
                                    </T>
                                  </Pressable>
                                </View>
                              ) : (
                                <Pressable accessibilityRole="button" onPress={() => setEffectOpen(given.id)}>
                                  <T size={13} weight="semibold" color="#9a6212">
                                    Record how it worked
                                  </T>
                                </Pressable>
                              )
                            ) : (
                              <T size={12} color={colors.mute}>
                                Ask how it worked from {fmt.time(new Date(new Date(given.at).getTime() + (round.effectMinutes ?? 60) * 60_000), zone)}.
                              </T>
                            )}
                          </View>
                        );
                      })}
                      {waitUntil ? (
                        <View style={[styles.state, { backgroundColor: "#fdf0dc" }]}>
                          <Icon name="clock" size={14} color="#9a6212" />
                          <T size={13} color="#9a6212" style={{ flex: 1 }}>
                            Not allowed again until {fmt.time(waitUntil, zone)}.
                          </T>
                        </View>
                      ) : prnOpen === med.id ? (
                        <View style={{ gap: 8 }}>
                          <TextInput value={prnReason} onChangeText={setPrnReason} maxLength={500} placeholder={`Why: ${med.prnUse}`} placeholderTextColor={colors.dim} style={ui.field} />
                          <Pressable accessibilityRole="button" disabled={busy === med.id} onPress={() => givePrn(med.id)} style={[styles.action, styles.give, { flex: 0 }]}>
                            <T weight="semibold" color="#ffffff">
                              {busy === med.id ? "Saving…" : "Give now"}
                            </T>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable accessibilityRole="button" onPress={() => setPrnOpen(med.id)} style={[styles.action, { flex: 0 }]}>
                          <T weight="semibold">Give a dose</T>
                        </Pressable>
                      )}
                    </View>
                  </Fragment>
                );
              })}
            </View>
          </>
        ) : null}

        {section("Later today", later, false)}
        {section("Done today", done, false)}
      </ScrollView>
    </View>
  );
}

function Tag({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
      <T weight="semibold" size={11} color={fg}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  head: { marginHorizontal: 22, marginTop: 18, marginBottom: 10, letterSpacing: -0.4 },
  group: { marginHorizontal: 20, backgroundColor: colors.card, borderRadius: 24, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginHorizontal: 16 },
  dose: { padding: 16, gap: 10 },
  doseTop: { flexDirection: "row", gap: 12 },
  state: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 8 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  give: { backgroundColor: colors.brand, borderColor: colors.brand, flex: 1.4 },
  banner: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginHorizontal: 20, marginBottom: 10, borderRadius: 14, padding: 12 },
});
