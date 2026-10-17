import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts } from "@expo-google-fonts/plus-jakarta-sans";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LockScreen } from "@/components/LockScreen";
import { BrandMark } from "@/components/BrandMark";
import { T } from "@/components/ui";
import { PushListener } from "@/components/PushListener";
import { SetPin } from "@/components/SetPin";
import { SignIn } from "@/components/SignIn";
import { ChatLiveProvider } from "@/lib/chat";
import { pushSupported } from "@/lib/push";
import { SessionProvider, useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

/* Nothing past this point shows unless someone is signed in and unlocked. */
function Gate() {
  const { status } = useSession();
  if (status === "loading")
    return (
      <View style={{ flex: 1, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
        <BrandMark size={160} />
        <T weight="heavy" size={30} color="#f8f7ee" style={{ marginTop: 20, letterSpacing: -1 }}>Mohuddle</T>
        <ActivityIndicator color={colors.lime} style={{ marginTop: 28 }} />
      </View>
    );
  if (status === "signed_out") return <SignIn />;
  if (status === "set_pin") return <SetPin />;
  // The lock covers the app rather than replacing it, so a half-written note is still there after unlocking.
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} importantForAccessibility={status === "locked" ? "no-hide-descendants" : "auto"} accessibilityElementsHidden={status === "locked"}>
        <ChatLiveProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }} />
        </ChatLiveProvider>
      </View>
      {pushSupported ? <PushListener /> : null}
      {status === "locked" ? (
        <View style={StyleSheet.absoluteFill}>
          <LockScreen />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsReady] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    // The handwriting fonts typed signatures use, the same files the server draws them with.
    SigCaveat: require("../../assets/fonts/Caveat.ttf"),
    SigDancing: require("../../assets/fonts/DancingScript.ttf"),
    SigVibes: require("../../assets/fonts/GreatVibes.ttf"),
    SigApple: require("../../assets/fonts/HomemadeApple.ttf"),
  });
  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync();
  }, [fontsReady]);
  if (!fontsReady) return null;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
