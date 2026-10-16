import { router, useFocusEffect } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScreenBar } from "@/components/ScreenBar";
import { ErrorText, Icon, T } from "@/components/ui";
import { ApiError, type TaskSummary } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

/* The staff member's tasks: open ones first, soonest due first, then what they finished today. */
export default function TasksScreen() {
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      call<{ tasks: TaskSummary[] }>("/tasks").then(
        result => setTasks(result.tasks),
        problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
      );
    }, [call]),
  );

  const [now] = useState(() => Date.now());
  const open = tasks?.filter(task => task.status === "open") ?? [];
  const done = tasks?.filter(task => task.status === "done") ?? [];

  const list = (items: TaskSummary[]) => (
    <View style={[styles.group, shadow.soft]}>
      {items.map((task, index) => {
        const late = task.status === "open" && task.dueAt && new Date(task.dueAt).getTime() < now;
        return (
          <Fragment key={task.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/task", params: { id: task.id } })} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
              <View style={[styles.mark, task.status === "done" ? { backgroundColor: colors.sageSoft } : task.priority === "high" ? { backgroundColor: colors.flagSoft } : { backgroundColor: colors.ground }]}>
                <Icon name={task.status === "done" ? "check" : "circle"} size={15} color={task.status === "done" ? colors.sage : task.priority === "high" ? colors.flag : colors.mute} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="semibold" numberOfLines={2} style={task.status === "done" ? { color: colors.mute } : undefined}>
                  {task.title}
                </T>
                <T size={13} color={late ? colors.flag : colors.mute} numberOfLines={1}>
                  {[task.dueAt ? `${late ? "Was due" : "Due"} ${fmt.dayShort(task.dueAt, zone)}, ${fmt.time(task.dueAt, zone)}` : null, task.person, task.home].filter(Boolean).join(" · ") || "No due date"}
                </T>
              </View>
              <Icon name="chevron-right" size={18} color={colors.dim} />
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScreenBar title="My tasks" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 12, paddingBottom: 48 }}>
        <ErrorText>{error}</ErrorText>
        {tasks && !tasks.length ? (
          <View style={[styles.group, { padding: 24, alignItems: "center" }, shadow.soft]}>
            <Icon name="check-circle" size={22} color={colors.sage} />
            <T weight="semibold" style={{ marginTop: 8 }}>
              No tasks for you
            </T>
          </View>
        ) : null}
        {open.length ? list(open) : null}
        {done.length ? (
          <>
            <T weight="bold" size={16} style={{ marginTop: 8 }}>
              Done today
            </T>
            {list(done)}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.card, borderRadius: 24, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 62 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  mark: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
