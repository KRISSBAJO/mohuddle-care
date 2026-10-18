import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WorkflowForm } from "@/components/WorkflowForm";
import { Button, ErrorText, Section, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
type Task = { id: string; title: string; details: string; assignedTo: string | null; homeId: string | null; individualId: string | null; priority: string; category: string; dueAt: string | null; status: string };
type TaskBoard = { tasks: Task[]; staff: { id: string; name: string }[]; homes: { id: string; name: string }[]; people: { id: string; name: string }[]; categories: string[] };
export default function ManageTasksScreen() {
  const { call, me } = useSession(); const scope = `${me?.agency?.id}.${me?.user.id}`;
  const [loaded, setLoaded] = useState<{ scope: string; data: TaskBoard } | null>(null), [error, setError] = useState("");
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const data = loaded?.scope === scope ? loaded.data : null;
  const load = useCallback(() => call<TaskBoard>("/operations?mode=tasks").then(data => { setLoaded({ scope, data }); setError(""); }, problem => setError(problem instanceof ApiError ? problem.message : "Could not load tasks.")), [call, scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  function edit(task?: Task) {
    const initial: Record<string, string> = { id: task?.id ?? "", title: task?.title ?? "", details: task?.details ?? "", assignedTo: task?.assignedTo ?? "", homeId: task?.homeId ?? "", individualId: task?.individualId ?? "", priority: task?.priority ?? "normal", category: task?.category ?? "", dueDate: "", dueTime: "" };
    if (task?.dueAt) { initial.dueDate = new Intl.DateTimeFormat("en-CA", { timeZone: me?.agency?.zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(task.dueAt)); initial.dueTime = new Intl.DateTimeFormat("en-GB", { timeZone: me?.agency?.zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(task.dueAt)); }
    setEditing(initial);
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
    <Button label="Back" tone="ghost" onPress={() => goBack()} /><T size={25} weight="bold">Manage tasks</T><ErrorText>{error}</ErrorText>
    {data ? editing ? <><WorkflowForm key={editing.id || "new"} scope={`task.${editing.id || "new"}`} initial={editing} fields={[
      { key: "title", label: "Task title", max: 160 }, { key: "details", label: "What needs doing", multiline: true, max: 2000 },
      { key: "assignedTo", label: "Assign to", options: data.staff.map(person => [person.id, person.name] as const) }, { key: "homeId", label: "Home (optional)", options: data.homes.map(home => [home.id, home.name] as const) }, { key: "individualId", label: "Person supported (optional)", options: data.people.map(person => [person.id, person.name] as const) },
      { key: "priority", label: "Priority", options: [["low", "Low"], ["normal", "Normal"], ["high", "High"]] }, { key: "category", label: "Category", options: data.categories }, { key: "dueDate", label: "Due date (YYYY-MM-DD, optional)", max: 10 }, { key: "dueTime", label: "Due time (HH:MM, optional)", max: 5 },
    ]} onSave={async fields => { const result = await call<{ id?: string }>("/operations", { action: fields.id ? "edit_task" : "task", ...(fields.id ? { id: fields.id } : {}), fields }); setEditing(null); await load(); const id = result.id || fields.id; if (id) router.push({ pathname: "/task", params: { id } }); }} /><Button label="Close editor" tone="ghost" onPress={() => setEditing(null)} /></> : <><Button label="Create and assign a task" icon="plus" onPress={() => edit()} /><T size={13}>Latest 150 tasks</T>{data.tasks.map(task => <Section key={task.id} title={task.title}><T>{data.staff.find(person => person.id === task.assignedTo)?.name ?? "Unassigned"} · {task.priority} · {task.status}</T><Button label="Open task and comments" tone="ghost" onPress={() => router.push({ pathname: "/task", params: { id: task.id } })} /><Button label="Edit or reassign" tone="ghost" onPress={() => edit(task)} /></Section>)}</> : <Button label="Try again" tone="ghost" onPress={() => void load()} />}
  </ScrollView></SafeAreaView>;
}
