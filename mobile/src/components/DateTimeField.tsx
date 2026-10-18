import { useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { calendarDays, clockValue, moveMonth, parseClock, validDay } from "@/lib/date-input";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { Button, Chips, Icon, T } from "./ui";

export function DateTimeField({ label, value, onChange, kind }: { label: string; value: string; onChange: (value: string) => void; kind: "date" | "time" }) {
  const { me } = useSession(); const zone = me?.agency?.zone;
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(""), [month, setMonth] = useState("2026-01");
  const [hour, setHour] = useState(9), [minute, setMinute] = useState(0);
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const now = () => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const title = label.replace(/\s*\((?:YYYY-MM-DD|HH:MM)(?:, optional)?\)/gi, "");
  function start() {
    Keyboard.dismiss();
    const day = validDay(value) ? value : today(); setSelected(day); setMonth(day.slice(0, 7));
    const time = parseClock(value) ?? parseClock(now())!; setHour(time.hour); setMinute(time.minute); setOpen(true);
  }
  function stepMinute(amount: number) { const total = (hour * 60 + minute + amount + 1440) % 1440; setHour(Math.floor(total / 60)); setMinute(total % 60); }
  const shown = kind === "date" && validDay(value) ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : kind === "time" && parseClock(value) ? `${Number(value.slice(0, 2)) % 12 || 12}:${value.slice(3)} ${Number(value.slice(0, 2)) < 12 ? "AM" : "PM"}` : "";
  return <View style={{ gap: 7 }}><T weight="medium" size={14}>{title}</T>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${shown || `Choose ${kind}`}`} onPress={start} style={{ minHeight: 54, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10 }}><Icon name={kind === "date" ? "calendar" : "clock"} color={colors.sage} /><T style={{ flex: 1 }} color={shown ? colors.ink : colors.mute}>{shown || `Choose ${kind}`}</T><Icon name="chevron-down" color={colors.mute} /></Pressable>
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.35)" }}><SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.ground, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "90%" }}><ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
        <T weight="bold" size={22}>{title}</T>
        {kind === "date" ? <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(moveMonth(month, -1))} style={{ padding: 12 }}><Icon name="chevron-left" /></Pressable><T weight="semibold">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))}</T><Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(moveMonth(month, 1))} style={{ padding: 12 }}><Icon name="chevron-right" /></Pressable></View>
          <View style={{ flexDirection: "row" }}>{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <T key={index} size={12} color={colors.mute} style={{ width: `${100 / 7}%`, textAlign: "center" }}>{day}</T>)}</View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{calendarDays(month).map((day, index) => <View key={day ?? `empty${index}`} style={{ width: `${100 / 7}%`, padding: 2 }}>{day ? <Pressable accessibilityRole="button" accessibilityLabel={day} accessibilityState={{ selected: day === selected }} onPress={() => setSelected(day)} style={{ minHeight: 44, borderRadius: 14, backgroundColor: day === selected ? colors.brand : colors.card, alignItems: "center", justifyContent: "center" }}><T weight="semibold" color={day === selected ? "#fff" : colors.ink}>{Number(day.slice(8))}</T></Pressable> : <View style={{ height: 44 }} />}</View>)}</View>
          <Button label="Today" tone="ghost" onPress={() => { const day = today(); setSelected(day); setMonth(day.slice(0, 7)); }} />
        </> : <>
          <T size={32} weight="bold" style={{ textAlign: "center" }}>{hour % 12 || 12}:{String(minute).padStart(2, "0")} {hour < 12 ? "AM" : "PM"}</T>
          <T weight="medium">Hour</T><Chips options={Array.from({ length: 12 }, (_, index) => String(index + 1))} value={String(hour % 12 || 12)} onChange={next => { if (next) setHour(Number(next) % 12 + (hour >= 12 ? 12 : 0)); }} />
          <T weight="medium">Minute</T><Chips options={Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"))} value={String(minute).padStart(2, "0")} onChange={next => { if (next) setMinute(Number(next)); }} />
          <View style={{ flexDirection: "row", gap: 10 }}><Button label="−1 minute" tone="ghost" style={{ flex: 1 }} onPress={() => stepMinute(-1)} /><Button label="+1 minute" tone="ghost" style={{ flex: 1 }} onPress={() => stepMinute(1)} /></View>
          <Chips options={["AM", "PM"]} value={hour < 12 ? "AM" : "PM"} onChange={next => { if (next) setHour(hour % 12 + (next === "PM" ? 12 : 0)); }} /><Button label="Use current time" tone="ghost" onPress={() => { const current = parseClock(now())!; setHour(current.hour); setMinute(current.minute); }} />
          <T size={12} color={colors.mute}>Times use {zone ?? "your agency’s time zone"}.</T>
        </>}
        <Button label={kind === "date" ? "Use this date" : "Use this time"} onPress={() => { onChange(kind === "date" ? selected : clockValue(hour, minute)); setOpen(false); }} /><Button label="Cancel" tone="ghost" onPress={() => setOpen(false)} />{value ? <Button label="Clear selection" tone="ghost" onPress={() => { onChange(""); setOpen(false); }} /> : null}
      </ScrollView></SafeAreaView></View>
    </Modal>
  </View>;
}
