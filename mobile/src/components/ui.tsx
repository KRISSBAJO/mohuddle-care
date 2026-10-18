import { Feather } from "@expo/vector-icons";
import { forwardRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { colors, fonts, shadow } from "@/lib/theme";
import { SearchPicker } from "./SearchPicker";

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

export const Field = forwardRef<TextInput, TextInputProps & { label: string }>(function Field({ label, style, secureTextEntry, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T weight="medium" size={14}>
        {label}
      </T>
      <View style={{ position: "relative" }}>
        <TextInput ref={ref} placeholderTextColor={colors.dim} {...props} secureTextEntry={secureTextEntry && !visible} style={[styles.field, secureTextEntry && { paddingRight: 52 }, style]} />
        {secureTextEntry && <Pressable accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"} accessibilityState={{ selected: visible }} onPress={() => setVisible(value => !value)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 48, alignItems: "center", justifyContent: "center" }}><Icon name={visible ? "eye-off" : "eye"} color={colors.mute} size={20} /></Pressable>}
      </View>
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

/* A row that ticks on and off. */
export function Check({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={styles.check}>
      <View style={[styles.box, checked && { backgroundColor: colors.brand, borderColor: colors.brand }]}>{checked ? <Icon name="check" size={14} color="#ffffff" /> : null}</View>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <T size={15}>{children}</T> : children}</View>
    </Pressable>
  );
}

/* One of a few choices, as cards. */
export function Choice<V extends string>({ value, options, onChange }: { value: V; options: [V, string][]; onChange: (next: V) => void }) {
  if (options.length > 8) return <SearchPicker label="Choose an option" options={options} value={value} onChange={next => onChange(next as V)} />;
  return (
    <View style={{ gap: 8 }}>
      {options.map(([key, words]) => {
        const chosen = key === value;
        return (
          <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: chosen }} onPress={() => onChange(key)} style={[styles.choice, chosen && { borderColor: colors.brand, backgroundColor: colors.wash }]}>
            <View style={[styles.radio, chosen && { borderColor: colors.brand }]}>{chosen ? <View style={styles.radioDot} /> : null}</View>
            <T weight={chosen ? "semibold" : "regular"} style={{ flex: 1 }}>
              {words}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* Pick one (or, with multi, any) from short options, as chips that wrap. Tapping the chosen one clears it. */
export function Chips({ options, value, onChange, multi }: { options: (string | readonly [string, string])[]; value: string | string[]; onChange: (next: string | string[]) => void; multi?: boolean }) {
  if (!multi && options.length > 16) return <SearchPicker label="Choose an option" options={options} value={typeof value === "string" ? value : value[0] ?? ""} onChange={onChange} clearable />;
  const chosen = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <View style={styles.chips}>
      {options.map(entry => {
        const [option, words] = typeof entry === "string" ? [entry, entry] : entry;
        const on = chosen.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole={multi ? "checkbox" : "radio"}
            accessibilityState={{ checked: on }}
            onPress={() => (multi ? onChange(on ? chosen.filter(item => item !== option) : [...chosen, option]) : onChange(on ? "" : option))}
            style={[styles.chip, on && { backgroundColor: colors.brand, borderColor: colors.brand }]}
          >
            <T weight={on ? "semibold" : "medium"} size={14} color={on ? "#ffffff" : colors.ink}>
              {words}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* A titled block inside a long form. "must" marks something that stops the punch until done. */
export function Section({ title, hint, tone, children }: { title: string; hint?: string; tone?: "must" | "warn" | "good"; children: React.ReactNode }) {
  const accent = tone === "must" ? colors.flag : tone === "warn" ? "#b7791f" : tone === "good" ? colors.sage : null;
  return (
    <View style={[styles.card, { gap: 12 }]}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {accent ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} /> : null}
          <T weight="bold" size={16}>
            {title}
          </T>
        </View>
        {hint ? (
          <T size={13} color={colors.mute}>
            {hint}
          </T>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  check: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 6 },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center", marginTop: 1 },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, padding: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  area: { minHeight: 110, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  button: { minHeight: 50, borderRadius: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1 },
  field: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 16, ...shadow.soft },
  error: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.flagSoft, borderRadius: 12, padding: 12 },
});
