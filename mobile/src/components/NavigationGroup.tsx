import { Children, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme";
import { Icon, T, type IconName } from "./ui";

/** One shared row treatment for navigation; primary work actions remain buttons. */
export function NavigationRow({ label, detail, icon, onPress, danger = false, expanded, external = false, disabled = false }: {
  label: string; detail?: string; icon: IconName; onPress?: () => void;
  danger?: boolean; expanded?: boolean; external?: boolean; disabled?: boolean;
}) {
  const content = <>
    <View style={[styles.icon, danger && { backgroundColor: colors.flagSoft }]}><Icon name={icon} size={18} color={danger ? colors.flag : colors.brand} /></View>
    <View style={styles.copy}><T weight="semibold" size={15} color={danger ? colors.flag : colors.ink}>{label}</T>{detail ? <T size={12} color={colors.mute}>{detail}</T> : null}</View>
    {onPress ? <Icon name={external ? "external-link" : expanded === undefined ? "chevron-right" : expanded ? "chevron-up" : "chevron-down"} size={17} color={colors.mute} /> : null}
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.ground }, disabled && { opacity: 0.6 }]}>{content}</Pressable> : <View style={styles.row}>{content}</View>;
}

export function NavigationGroup({ title, children }: { title?: string; children: ReactNode }) {
  return <View style={styles.section}>{title ? <T accessibilityRole="header" weight="bold" size={16} style={styles.title}>{title}</T> : null}<View style={styles.group}>{Children.toArray(children).map((child, index) => <View key={(child as { key?: string }).key ?? index} style={index ? styles.divider : undefined}>{child}</View>)}</View></View>;
}
const styles = StyleSheet.create({
  section: { gap: 10 },
  title: { paddingHorizontal: 2 },
  group: { backgroundColor: colors.card, borderRadius: 22, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  row: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.wash, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  copy: { flex: 1, gap: 3 },
});
