import { Feather } from "@expo/vector-icons";
import { forwardRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { colors, fonts, shadow } from "@/lib/theme";

type Weight = keyof typeof fonts;

/* Text in Inter. */
export function T({ weight = "regular", size = 15, color = colors.ink, style, ...props }: TextProps & { weight?: Weight; size?: number; color?: string }) {
  return <Text {...props} style={[{ fontFamily: fonts[weight], fontSize: size, color, lineHeight: Math.round(size * 1.35) }, style as StyleProp<TextStyle>]} />;
}

export type IconName = React.ComponentProps<typeof Feather>["name"];
export const Icon = ({ name, size = 18, color = colors.ink }: { name: IconName; size?: number; color?: string }) => <Feather name={name} size={size} color={color} />;

type ButtonTone = "brand" | "lime" | "ghost" | "danger" | "onBrand";
const buttonTones: Record<ButtonTone, { bg: string; fg: string; border?: string }> = {
  brand: { bg: colors.brand, fg: "#ffffff" },
  lime: { bg: colors.lime, fg: colors.brand },
  ghost: { bg: "transparent", fg: colors.ink, border: colors.line },
  danger: { bg: colors.flagSoft, fg: colors.flag },
  onBrand: { bg: "transparent", fg: "#ffffff" },
};

export function Button({ label, tone = "brand", icon, busy, style, ...props }: PressableProps & { label: string; tone?: ButtonTone; icon?: IconName; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  const look = buttonTones[tone];
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      disabled={busy || props.disabled}
      style={({ pressed }) => [styles.button, { backgroundColor: look.bg, borderColor: look.border ?? look.bg, opacity: pressed ? 0.85 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={look.fg} /> : icon ? <Icon name={icon} size={18} color={look.fg} /> : null}
      <T weight="semibold" color={look.fg}>
        {label}
      </T>
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string }>(function Field({ label, style, ...props }, ref) {
  return (
    <View style={{ gap: 6 }}>
      <T weight="medium" size={14}>
        {label}
      </T>
      <TextInput ref={ref} placeholderTextColor={colors.dim} {...props} style={[styles.field, style]} />
    </View>
  );
});

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/* A message under a form: what went wrong, in words. */
export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <View style={styles.error} accessibilityLiveRegion="polite">
      <Icon name="alert-circle" size={16} color={colors.flag} />
      <T size={14} color={colors.flag} style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1 },
  field: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 16, ...shadow.soft },
  error: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.flagSoft, borderRadius: 12, padding: 12 },
});
