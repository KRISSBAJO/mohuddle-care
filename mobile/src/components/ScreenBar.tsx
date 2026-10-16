import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { goBack } from "@/lib/nav";
import { colors } from "@/lib/theme";
import { Icon, T } from "./ui";

/* The top bar of a screen opened from a tab: back, the title, and room for one button on the right. */
export function ScreenBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <SafeAreaView edges={["top"]} style={styles.bar}>
      <StatusBar style="dark" />
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBack()} style={styles.back}>
        <Icon name="chevron-left" size={22} />
      </Pressable>
      <T weight="bold" size={17} numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>
        {title}
      </T>
      <View style={{ width: 40, alignItems: "center" }}>{right}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: colors.ground },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
});
