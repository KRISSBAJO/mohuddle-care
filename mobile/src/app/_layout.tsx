import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts } from "@expo-google-fonts/plus-jakarta-sans";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LockScreen } from "@/components/LockScreen";
import { SetPin } from "@/components/SetPin";
import { SignIn } from "@/components/SignIn";
import { SessionProvider, useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

/* Nothing past this point shows unless someone is signed in and unlocked. */
function Gate() {
  const { status } = useSession();
  if (status === "loading")
    return (
      <View style={{ flex: 1, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.lime} />
      </View>
    );
  if (status === "signed_out") return <SignIn />;
  if (status === "locked") return <LockScreen />;
  if (status === "set_pin") return <SetPin />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }} />;
}

export default function RootLayout() {
  const [fontsReady] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
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
