import { Tabs } from "expo-router";
import { Icon, type IconName } from "@/components/ui";
import { colors, fonts, shadow } from "@/lib/theme";

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: unknown }) => <Icon name={icon} size={21} color={String(color)} />,
});

/* The bottom bar. Tabs are added here as each part of the app is built. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.sage,
        tabBarInactiveTintColor: colors.dim,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        // A floating, rounded bar above the page.
        tabBarStyle: { position: "absolute", left: 20, right: 20, bottom: 18, height: 66, paddingTop: 8, paddingBottom: 8, borderRadius: 33, backgroundColor: colors.card, borderTopWidth: 0, ...shadow.float },
        sceneStyle: { backgroundColor: colors.ground },
      }}
    >
      <Tabs.Screen name="today" options={tab("Today", "home")} />
      <Tabs.Screen name="more" options={tab("More", "more-horizontal")} />
    </Tabs>
  );
}
