import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ScreenBar } from "@/components/ScreenBar";
import { Button, ErrorText, Section, styles as ui, T } from "@/components/ui";
import { ApiError, type TaskDetail } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

const PRIORITY = { low: "Low priority", normal: "", high: "High priority" };

/* One task: what it is, its conversation, and marking it done. */
export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => call<TaskDetail>(`/tasks/${id}`).then(setTask, problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.")), [call, id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function send(path: string, body: unknown, what: string) {
    setBusy(what);
    setError("");
    try {
      await call(path, body);
      setNote("");
      setComment("");
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  if (!task)
    return (
      <View style={{ flex: 1, backgroundColor: colors.ground }}>
        <ScreenBar title="Task" />
        <View style={{ padding: 20 }}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.brand} />}</View>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScreenBar title="Task" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, shadow.soft]}>
            <T weight="bold" size={20} style={{ letterSpacing: -0.4 }}>
              {task.title}
            </T>
            <T size={13} color={colors.mute}>
              {[task.dueAt ? `Due ${fmt.dayShort(task.dueAt, zone)}, ${fmt.time(task.dueAt, zone)}` : "No due date", PRIORITY[task.priority], task.person ? `${task.person} ${task.personLast ?? ""}`.trim() : null, task.home].filter(Boolean).join(" · ")}
            </T>
            {task.details ? <T style={{ marginTop: 8 }}>{task.details}</T> : null}
          </View>

          {task.status === "done" ? (
            <View style={[styles.done, shadow.soft]}>
              <T weight="semibold" color={colors.sage}>
                Done {task.completedAt ? `${fmt.dayShort(task.completedAt, zone)}, ${fmt.time(task.completedAt, zone)}` : ""}
              </T>
              {task.completionNote ? <T color={colors.sage}>{task.completionNote}</T> : null}
            </View>
          ) : (
            <Section title="Finish it">
              <TextInput value={note} onChangeText={setNote} maxLength={1000} placeholder="What you did (optional)" placeholderTextColor={colors.dim} style={ui.field} />
              <Button label="Mark as done" icon="check" busy={busy === "done"} onPress={() => send(`/tasks/${task.id}/done`, { note }, "done")} />
            </Section>
          )}

          <Section title={`Conversation (${task.comments.length})`}>
            {task.comments.map(entry => (
              <View key={entry.id} style={styles.comment}>
                <T size={12} weight="semibold" color={colors.mute}>
                  {entry.by ?? "Someone"} · {fmt.dayShort(entry.createdAt, zone)}, {fmt.time(entry.createdAt, zone)}
                </T>
                <T>{entry.body}</T>
              </View>
            ))}
            <TextInput multiline value={comment} onChangeText={setComment} maxLength={2000} placeholder="Ask a question or add an update" placeholderTextColor={colors.dim} style={[ui.field, { minHeight: 70, paddingTop: 12, textAlignVertical: "top" }]} />
            <Button label="Send" tone="ghost" icon="send" busy={busy === "comment"} onPress={() => send(`/tasks/${task.id}/comments`, { body: comment }, "comment")} />
          </Section>

          <ErrorText>{error}</ErrorText>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 8, gap: 14, paddingBottom: 48 },
  hero: { backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 4 },
  done: { backgroundColor: colors.sageSoft, borderRadius: 20, padding: 16, gap: 4 },
  comment: { backgroundColor: colors.ground, borderRadius: 14, padding: 12, gap: 2 },
});
