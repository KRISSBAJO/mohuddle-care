import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { API_URL, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";
import { Icon, T } from "./ui";

export type Draft = Record<string, string | number | boolean | null>;
type Stage = "idle" | "recording" | "words" | "drafting" | "done" | "error";

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/*
 * Speak your note: record the shift in your own words, then the server turns the recording into
 * words and the words into a draft of the note. The recording is not kept anywhere. Staff read
 * every part of the draft before they sign.
 */
export function SpeakNote({ personId, onDraft }: { personId: string; onDraft: (draft: Draft) => number }) {
  const { token } = useSession();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [stage, setStage] = useState<Stage>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [words, setWords] = useState("");
  const started = useRef(0);

  useEffect(() => {
    if (stage !== "recording") return;
    const timer = setInterval(() => setElapsed(Date.now() - started.current), 500);
    return () => clearInterval(timer);
  }, [stage]);

  async function start() {
    setMessage("");
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setStage("error");
      setMessage("Mohuddle needs the microphone to hear your note. Allow it in your phone's settings.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    started.current = Date.now();
    setElapsed(0);
    setStage("recording");
  }

  async function stop() {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (!uri) {
      setStage("error");
      setMessage("Nothing was recorded. Try again.");
      return;
    }
    try {
      setStage("words");
      const audio = await (await fetch(uri)).blob();
      const heard = await fetch(`${API_URL}/api/v1/scribe/transcribe?encoded=1&person=${personId}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": audio.type || "audio/m4a" }, body: audio });
      const result = (await heard.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!heard.ok || !result.text) throw new ApiError(heard.status, "failed", result.error ?? "No words were heard. Try again, a little closer to the phone.");
      setWords(result.text);
      setStage("drafting");
      const drafted = await fetch(`${API_URL}/api/v1/scribe/draft`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ kind: "daily", text: result.text, person: personId }) });
      const draft = (await drafted.json().catch(() => ({}))) as { draft?: Draft; error?: string };
      if (!drafted.ok || !draft.draft) throw new ApiError(drafted.status, "failed", draft.error ?? "The draft could not be written. Your words are below to copy.");
      const filled = onDraft(draft.draft);
      setStage("done");
      setMessage(filled ? `Filled ${filled} ${filled === 1 ? "part" : "parts"} of the note. Read each one and change anything that is wrong.` : "Nothing new to fill in. Your words are below.");
    } catch (problem) {
      setStage("error");
      setMessage(problem instanceof ApiError ? problem.message : "No connection. Check your signal and try again.");
    }
  }

  const busy = stage === "words" || stage === "drafting";
  return (
    <View style={[styles.card, shadow.soft]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={stage === "recording" ? "Stop recording" : "Speak your note"}
          disabled={busy}
          onPress={stage === "recording" ? stop : start}
          style={[styles.mic, stage === "recording" && { backgroundColor: colors.flag }]}
        >
          {busy ? <ActivityIndicator color={colors.lime} /> : <Icon name={stage === "recording" ? "square" : "mic"} size={22} color={stage === "recording" ? "#ffffff" : colors.lime} />}
        </Pressable>
        <View style={{ flex: 1 }}>
          <T weight="bold" size={16}>
            {stage === "recording" ? `Listening… ${clock(elapsed)}` : stage === "words" ? "Turning your words into text…" : stage === "drafting" ? "Writing the draft…" : "Speak your note"}
          </T>
          <T size={13} color={colors.mute}>
            {stage === "recording"
              ? "Tap stop when you have finished."
              : stage === "words"
                ? "This takes a few seconds."
                : stage === "drafting"
                  ? "This can take about a minute. Keep the app open."
                  : "Talk through the shift: meals, health, activities, anything that happened."}
          </T>
        </View>
      </View>
      {message ? (
        <View style={[styles.message, stage === "error" ? { backgroundColor: colors.flagSoft } : { backgroundColor: colors.sageSoft }]}>
          <T size={13} color={stage === "error" ? colors.flag : colors.sage}>
            {message}
          </T>
        </View>
      ) : null}
      {words ? (
        <T size={13} color={colors.mute} style={{ marginTop: 10 }} selectable>
          You said: “{words}”
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  mic: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  message: { marginTop: 12, borderRadius: 12, padding: 10 },
});
