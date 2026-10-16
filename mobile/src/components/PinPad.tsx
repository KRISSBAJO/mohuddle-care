import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme";
import { Icon, T, type IconName } from "./ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/* PIN dots and a number pad, drawn for a dark green background. */
export function PinPad({
  length,
  value,
  onChange,
  side,
  shake,
}: {
  length: number;
  value: string;
  onChange: (next: string) => void;
  /* The bottom-left key: fingerprint or face unlock, when offered. */
  side?: { icon: IconName; label: string; onPress: () => void };
  /* Shows the dots in red after a wrong PIN. */
  shake?: boolean;
}) {
  const press = (digit: string) => value.length < length && onChange(value + digit);
  const key = (content: React.ReactNode, label: string, onPress?: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.key, !onPress && { backgroundColor: "transparent" }, pressed && { backgroundColor: "rgba(255,255,255,0.2)" }]}
    >
      {content}
    </Pressable>
  );
  return (
    <View style={{ alignItems: "center", gap: 28 }}>
      <View style={styles.dots} accessibilityLabel={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, index) => (
          <View key={index} style={[styles.dot, index < value.length && { backgroundColor: shake ? "#f19b8f" : colors.lime, borderColor: shake ? "#f19b8f" : colors.lime }]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map(digit =>
          key(
            <T weight="semibold" size={26} color="#ffffff">
              {digit}
            </T>,
            digit,
            () => press(digit),
          ),
        )}
        {side ? key(<Icon name={side.icon} size={26} color={colors.lime} />, side.label, side.onPress) : key(null, "blank")}
        {key(
          <T weight="semibold" size={26} color="#ffffff">
            0
          </T>,
          "0",
          () => press("0"),
        )}
        {key(<Icon name="delete" size={24} color="#ffffff" />, "Delete", value ? () => onChange(value.slice(0, -1)) : undefined)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", gap: 16, minHeight: 18 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.55)" },
  grid: { width: 276, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.09)" },
});
