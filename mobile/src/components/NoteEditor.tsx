import { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts } from "@/lib/theme";
import { Button, Icon, T } from "./ui";

export function NoteEditor({ label, value, onChange, placeholder, maxLength = 5000, hint }: { label?: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number; hint?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState({ start: value.length, end: value.length });
  const [history, setHistory] = useState<string[]>([]), [future, setFuture] = useState<string[]>([]);
  const inlineInput = useRef<TextInput>(null), expandedInput = useRef<TextInput>(null);
  function change(next: string) {
    if (next === value) return;
    setHistory(previous => [...previous.slice(-79), value]);
    setFuture([]); onChange(next);
  }
  function insert(text: string) {
    const start = Math.min(selection.start, value.length), end = Math.min(selection.end, value.length);
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > maxLength) return;
    change(next); (expanded ? expandedInput : inlineInput).current?.focus();
  }
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  function editor(full: boolean) {
    return <View style={{ flex: full ? 1 : undefined, borderWidth: 1.5, borderColor: focused ? colors.sage : colors.line, borderRadius: 18, backgroundColor: colors.card, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, padding: 8, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.wash }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Insert bullet" onPress={() => insert(`${selection.start && value[selection.start - 1] !== "\n" ? "\n" : ""}• `)} style={{ padding: 12 }}><Icon name="list" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Insert paragraph" onPress={() => insert("\n\n")} style={{ padding: 12 }}><Icon name="align-left" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Undo typing" disabled={!history.length} onPress={() => { const previous = history[history.length - 1]; if (previous !== undefined) { setHistory(history.slice(0, -1)); setFuture([...future, value]); onChange(previous); } }} style={{ padding: 12, opacity: history.length ? 1 : 0.35 }}><Icon name="rotate-ccw" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Redo typing" disabled={!future.length} onPress={() => { const next = future[future.length - 1]; if (next !== undefined) { setFuture(future.slice(0, -1)); setHistory([...history, value]); onChange(next); } }} style={{ padding: 12, opacity: future.length ? 1 : 0.35 }}><Icon name="rotate-cw" /></Pressable>
        {!full ? <Pressable accessibilityRole="button" accessibilityLabel={`Expand ${label ?? "note"} editor`} onPress={() => setExpanded(true)} style={{ padding: 12, marginLeft: "auto" }}><Icon name="maximize-2" /></Pressable> : null}
      </View>
      <TextInput ref={full ? expandedInput : inlineInput} accessibilityLabel={label ?? "Note"} multiline value={value} onChangeText={change} onSelectionChange={event => setSelection(event.nativeEvent.selection)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={placeholder ?? "Write what happened, in your own words…"} placeholderTextColor={colors.dim} maxLength={maxLength} textAlignVertical="top" scrollEnabled={full} autoCapitalize="sentences" style={{ flex: full ? 1 : undefined, minHeight: full ? 220 : 160, padding: 16, fontFamily: fonts.regular, fontSize: 16, lineHeight: 25, color: colors.ink }} />
      <View style={{ paddingHorizontal: 15, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.line }}><T size={12} color={colors.mute}>{words} {words === 1 ? "word" : "words"} · {value.length}/{maxLength}</T>{hint ? <T size={12} color={colors.mute}>{hint}</T> : null}</View>
    </View>;
  }
  return <View style={{ gap: 7 }}>{label ? <T weight="medium" size={14}>{label}</T> : null}{editor(false)}
    <Modal visible={expanded} animationType="slide" onRequestClose={() => setExpanded(false)}><SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}><KeyboardAvoidingView style={{ flex: 1, padding: 16, gap: 12 }} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><T weight="bold" size={19} style={{ flex: 1 }}>{label ?? "Write your note"}</T><Button label="Done" tone="ghost" onPress={() => setExpanded(false)} /></View>{editor(true)}<T size={12} color={colors.mute}>Done returns to the form. Your note is submitted only when you sign and save.</T></KeyboardAvoidingView></SafeAreaView></Modal>
  </View>;
}
