import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenBar } from "@/components/ScreenBar";
import { Icon, T } from "@/components/ui";
import { API_URL, ApiError, type AskLink, type AskReply } from "@/lib/api";
import { useSession } from "@/lib/session";
import { readValue, writeValue } from "@/lib/storage";
import { colors, fonts, shadow } from "@/lib/theme";

type Turn = { id: number; who: "you" | "mohuddle"; text?: string; reply?: AskReply; done?: string };
type Busy = "" | "listening" | "hearing" | "thinking";

const CHIPS = ["Clock me in", "What's due?", "When is my next shift?", "Start my meal break", "I'm back", "How many hours this week?", "Clock me out"];
const SPEAK_KEY = "mohuddle.speakReplies";
// Sound louder than this counts as talking; after talking, a pause this long ends the request.
const LOUD_DB = -38;
const PAUSE_MS = 1400;
const LONGEST_MS = 20_000;

/*
 * Ask Mohuddle on the phone: type, or tap the microphone and speak. The website's assistant answers
 * from your own records with the same permission rules. Breaks start and end only when you tap the
 * button; clocking in opens the clock screen, where the handover and location check happen.
 */
export default function AskScreen() {
  const { call, token, me } = useSession();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<Busy>("");
  const [speak, setSpeak] = useState(false);
  const counter = useRef(0);
  const list = useRef<ScrollView>(null);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recording = useAudioRecorderState(recorder, 150);
  const heard = useRef({ talked: false, quietSince: 0 });

  useEffect(() => {
    readValue(SPEAK_KEY).then(
      value => setSpeak(value === "on"),
      () => undefined,
    );
    // Start the speech engine now, so the first spoken request is quick.
    if (token) void fetch(`${API_URL}/api/v1/scribe/warm?for=assistant`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
    return () => {
      void Speech.stop();
    };
  }, [token]);

  const add = (turn: Omit<Turn, "id">) => setTurns(current => [...current, { ...turn, id: ++counter.current }]);
  const sayAloud = (words: string) => {
    if (!speak) return;
    void Speech.stop();
    Speech.speak(words, { language: "en-US" });
  };

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy === "thinking") return;
    setText("");
    add({ who: "you", text: trimmed });
    setBusy("thinking");
    try {
      const reply = await call<AskReply>("/assistant", { text: trimmed });
      add({ who: "mohuddle", reply });
      sayAloud([reply.say, ...(reply.detail ?? []).slice(0, 3)].join(" "));
    } catch (problem) {
      add({ who: "mohuddle", reply: { say: problem instanceof ApiError ? problem.message : "Something went wrong. Try again.", links: [], via: "none" } });
    } finally {
      setBusy("");
    }
  }

  async function listen() {
    void Speech.stop();
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      add({ who: "mohuddle", reply: { say: "Mohuddle needs the microphone to hear you. Allow it in your phone's settings, or type instead.", links: [], via: "none" } });
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    heard.current = { talked: false, quietSince: 0 };
    recorder.record();
    setBusy("listening");
  }

  async function stopListening() {
    if (!recorder.isRecording) return;
    setBusy("hearing");
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (!uri || !heard.current.talked) return setBusy("");
    try {
      const audio = await (await fetch(uri)).blob();
      const response = await fetch(`${API_URL}/api/v1/scribe/transcribe?encoded=1&mode=assistant`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": audio.type || "audio/m4a" }, body: audio });
      const result = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!response.ok) throw new ApiError(response.status, "failed", result.error ?? "I could not hear that. Try again, or type.");
      setBusy("");
      if (result.text?.trim()) await ask(result.text);
    } catch (problem) {
      add({ who: "mohuddle", reply: { say: problem instanceof ApiError ? problem.message : "No connection. Check your signal and try again.", links: [], via: "none" } });
      setBusy("");
    }
  }

  // Stops by itself after a pause once you have spoken, or after 20 seconds. Tapping stop works too.
  const level = recording.metering ?? -160;
  useEffect(() => {
    if (busy !== "listening" || !recording.isRecording) return;
    const now = Date.now();
    if (level > LOUD_DB) heard.current = { talked: true, quietSince: 0 };
    else if (heard.current.talked && !heard.current.quietSince) heard.current.quietSince = now;
    const paused = heard.current.talked && heard.current.quietSince > 0 && now - heard.current.quietSince > PAUSE_MS;
    if (paused || recording.durationMillis > LONGEST_MS) void stopListening();
    // Only new meter readings should run this; stopListening reads the recorder itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, recording.durationMillis, recording.isRecording, busy]);

  function toggleSpeak() {
    const next = !speak;
    setSpeak(next);
    void writeValue(SPEAK_KEY, next ? "on" : "off");
    if (!next) void Speech.stop();
  }

  function open(link: AskLink) {
    if (link.screen) router.push(link.screen as never);
    else if (link.web) void Linking.openURL(`${API_URL}${link.web}`);
  }

  const markDone = (id: number, message: string) => {
    setTurns(current => current.map(turn => (turn.id === id ? { ...turn, done: message } : turn)));
    sayAloud(message);
  };

  const first = me?.user.name.split(" ")[0] ?? "";
  const meter = Math.max(0, Math.min(1, (level + 60) / 50));
  const waiting = busy === "hearing" || busy === "thinking";
  return (
    <View style={styles.page}>
      <ScreenBar
        title="Ask Mohuddle"
        right={
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: speak }} accessibilityLabel="Read answers aloud" onPress={toggleSpeak} style={styles.speaker}>
            <Icon name={speak ? "volume-2" : "volume-x"} size={18} color={speak ? colors.brand : colors.mute} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView ref={list} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}>
          {!turns.length ? (
            <View style={styles.empty}>
              <View style={styles.badge}>
                <Icon name="message-circle" size={24} color={colors.lime} />
              </View>
              <T weight="bold" size={20} style={{ letterSpacing: -0.4, textAlign: "center" }}>
                What do you need{first ? `, ${first}` : ""}?
              </T>
              <T color={colors.mute} style={{ textAlign: "center", lineHeight: 21 }}>
                Ask about your shift, your hours, what is due, or how something works. Tap the microphone to speak.
              </T>
              <View style={styles.chips}>
                {CHIPS.map(chip => (
                  <Pressable key={chip} accessibilityRole="button" onPress={() => ask(chip)} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                    <T size={14} weight="medium">
                      {chip}
                    </T>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {turns.map(turn =>
            turn.who === "you" ? (
              <View key={turn.id} style={styles.mine}>
                <T color="#ffffff">{turn.text}</T>
              </View>
            ) : (
              <View key={turn.id} style={[styles.theirs, shadow.soft]}>
                {turn.done ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon name="check-circle" size={18} color={colors.sage} />
                    <T weight="semibold" color={colors.sage} style={{ flex: 1 }}>
                      {turn.done}
                    </T>
                  </View>
                ) : turn.reply ? (
                  <Answer reply={turn.reply} open={open} call={call} onDone={message => markDone(turn.id, message)} />
                ) : null}
              </View>
            ),
          )}

          {waiting ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={colors.brand} />
              <T size={14} color={colors.mute}>
                {busy === "hearing" ? "Listening back…" : "Thinking…"}
              </T>
            </View>
          ) : null}
        </ScrollView>

        <SafeAreaView edges={["bottom"]} style={styles.composer}>
          {busy === "listening" ? (
            <View style={styles.listening}>
              <View style={styles.dot} />
              <T size={13} weight="semibold" color={colors.flag} style={{ flex: 1 }}>
                Listening. Stop talking and I will answer.
              </T>
              <View style={styles.meter}>
                <View style={[styles.meterFill, { width: `${Math.round(meter * 100)}%` }]} />
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={busy === "listening" ? "Stop listening" : "Speak"}
              disabled={waiting}
              onPress={busy === "listening" ? stopListening : listen}
              style={[styles.mic, busy === "listening" && { backgroundColor: colors.flag }, waiting && { opacity: 0.5 }]}
            >
              <Icon name={busy === "listening" ? "square" : "mic"} size={20} color={busy === "listening" ? "#ffffff" : colors.lime} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ask or tell Mohuddle…"
              placeholderTextColor={colors.dim}
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => ask(text)}
              accessibilityLabel="Your request"
              style={styles.input}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || Boolean(busy)} onPress={() => ask(text)} style={[styles.send, (!text.trim() || Boolean(busy)) && { opacity: 0.4 }]}>
              <Icon name="arrow-up" size={20} color={colors.brand} />
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* One answer: what Mohuddle says, the details, where to go next, and any break to confirm. */
function Answer({ reply, open, call, onDone }: { reply: AskReply; open: (link: AskLink) => void; call: <T>(path: string, body?: unknown) => Promise<T>; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(key: string, body: unknown, success: string) {
    setBusy(key);
    setError("");
    try {
      await call("/clock/break", body);
      onDone(success);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <T weight="semibold" style={{ lineHeight: 22 }}>
        {reply.say}
      </T>
      {reply.detail?.map((line, index) => (
        <View key={index} style={{ flexDirection: "row", gap: 8 }}>
          <View style={styles.bullet} />
          <T size={14} style={{ flex: 1, lineHeight: 20 }}>
            {line}
          </T>
        </View>
      ))}
      {reply.confirm?.action === "clock_in" ? (
        <Pressable accessibilityRole="button" onPress={() => open({ label: "Clock in", screen: "/clock" })} style={[styles.action, { justifyContent: "space-between" }]}>
          <View style={{ flex: 1 }}>
            <T weight="semibold" size={14} color="#ffffff">
              Clock in
            </T>
            <T size={12} color={colors.onBrandSoft}>
              {reply.confirm.detail}
            </T>
          </View>
          <Icon name="arrow-right" size={18} color={colors.lime} />
        </Pressable>
      ) : null}
      {reply.confirm?.action === "break_start"
        ? reply.confirm.options.map(option => (
            <Pressable key={option.kind} accessibilityRole="button" disabled={Boolean(busy)} onPress={() => run(option.kind, { action: "start", kind: option.kind }, `${option.kind === "meal" ? "Meal" : "Rest"} break started.`)} style={styles.action}>
              {busy === option.kind ? <ActivityIndicator color={colors.lime} /> : <Icon name="coffee" size={16} color={colors.lime} />}
              <T weight="semibold" size={14} color="#ffffff">
                Start {option.label.charAt(0).toLowerCase() + option.label.slice(1)}
              </T>
            </Pressable>
          ))
        : null}
      {reply.confirm?.action === "break_end" ? (
        <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => run("end", { action: "end" }, "Welcome back. Your break has ended.")} style={styles.action}>
          {busy === "end" ? <ActivityIndicator color={colors.lime} /> : <Icon name="check" size={16} color={colors.lime} />}
          <T weight="semibold" size={14} color="#ffffff">
            End break
          </T>
        </Pressable>
      ) : null}
      {error ? (
        <T size={13} color={colors.flag}>
          {error}
        </T>
      ) : null}
      {reply.links.length ? (
        <View style={styles.links}>
          {reply.links.map(link => (
            <Pressable key={`${link.label}${link.screen ?? link.web}`} accessibilityRole="link" accessibilityHint={link.web ? "Opens on the Mohuddle website" : undefined} onPress={() => open(link)} style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
              <T size={13} weight="semibold" color={colors.brand}>
                {link.label}
              </T>
              <Icon name={link.screen ? "arrow-right" : "external-link"} size={13} color={colors.brand} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {reply.links.some(link => link.web) ? (
        <T size={12} color={colors.dim}>
          Links with the box-and-arrow mark open on the Mohuddle website.
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  scroll: { padding: 20, paddingTop: 8, gap: 12, flexGrow: 1 },
  speaker: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  empty: { alignItems: "center", gap: 10, paddingTop: 36, paddingHorizontal: 8 },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: colors.brand, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  theirs: { alignSelf: "flex-start", maxWidth: "94%", backgroundColor: colors.card, borderRadius: 20, borderBottomLeftRadius: 6, padding: 14 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.sage, marginTop: 8 },
  action: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, borderRadius: 14, minHeight: 46, paddingHorizontal: 14, paddingVertical: 8 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  link: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.wash, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  composer: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.ground, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, gap: 8 },
  listening: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.flagSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.flag },
  meter: { width: 64, height: 6, borderRadius: 3, backgroundColor: "#ffffff", overflow: "hidden" },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: colors.flag },
  mic: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  send: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
});
