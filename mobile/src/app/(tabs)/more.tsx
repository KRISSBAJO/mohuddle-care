import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText, T } from "@/components/ui";
import { API_URL, ApiError } from "@/lib/api";
import { pendingIncidentUploads } from "@/lib/incident-uploads";
import { queuedDoses } from "@/lib/outbox";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { readValue, removeValue, writeValue } from "@/lib/storage";
import { PUSH_OFF_KEY } from "@/components/PushListener";
import { NavigationGroup, NavigationRow } from "@/components/NavigationGroup";
import { AppUpdates } from "@/components/AppUpdates";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { websiteAdminLinks } from "@/lib/website-admin";

const ROLES: Record<string, string> = { admin: "Administrator", coordinator: "Coordinator", nurse: "Nurse", dsp: "Direct support professional" };

/* Who is signed in, switching agency, and signing out. */
export default function MoreScreen() {
  const { me, call, signOut, switchAgency, biometricsOn } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const others = me?.agencies.filter(agency => agency.agencyId !== me.agency?.id) ?? [];
  // Doses saved with no signal are sent with this login; signing out first would strand them.
  const [photoQueue, setPhotoQueue] = useState<{ scope: string; count: number } | null>(null);
  const scope = `${me?.user.id}|${me?.agency?.id}`;
  const [unsent, setUnsent] = useState(0);
  const [sure, setSure] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [administrationOpen, setAdministrationOpen] = useState(false);
  const administration = websiteAdminLinks(me?.user.role ?? "");
  async function openWebsite(path: string) {
    setError("");
    try { await Linking.openURL(`${API_URL}${path}`); }
    catch { setError("Could not open the browser. Visit mohuddle.com and sign in to your agency."); }
  }
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (me?.agency) pendingIncidentUploads(me.user.id, me.agency.id).then(jobs => { if (active) setPhotoQueue({ scope, count: jobs.reduce((count, job) => count + job.photos.length, 0) }); }, () => { if (active) setError("Could not open incident photo recovery. Open Report an incident to retry."); });
      queuedDoses(`${me?.user.email}|${me?.agency?.id}`).then(list => setUnsent(list.length));
      return () => { active = false; };
    }, [me, scope]),
  );

  // Notifications: allowed by the phone, and not turned off here.
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  useFocusEffect(
    useCallback(() => {
      Promise.all([pushState(), readValue(PUSH_OFF_KEY)]).then(
        ([state, off]) => setPush(state === "on" && off === "1" ? "off" : state),
        () => setPush("unsupported"),
      );
    }, []),
  );
  async function changePush(on: boolean) {
    setPushBusy(true);
    setError("");
    try {
      if (on) {
        await removeValue(PUSH_OFF_KEY);
        setPush(await enablePush(call, true));
      } else {
        await disablePush(call);
        await writeValue(PUSH_OFF_KEY, "1");
        setPush("off");
      }
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Notifications could not be changed. Try again.");
    } finally {
      setPushBusy(false);
    }
  }

  async function switchTo(agencyId: string) {
    setBusy(agencyId);
    setError("");
    try {
      await switchAgency(agencyId);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const pushDescription = push === "on" ? "On · reminders and alerts" : push === "denied" ? "Blocked in phone settings" : push === "unsupported" ? "Unavailable on this device" : push === "off" ? "Off · alerts still show in the app" : "Checking phone settings…";
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.scroll}>
      <StatusBar style="dark" />
      <SafeAreaView edges={["top"]} style={styles.hero}>
        <T accessibilityRole="header" weight="bold" size={26}>More</T>
        <View style={styles.profile}>
          <View style={styles.avatar}><T weight="bold" size={18} color={colors.lime}>{(me?.user.name ?? "?").split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase()}</T></View>
          <View style={{ flex: 1, gap: 3 }}><T weight="bold" size={21}>{me?.user.name}</T><T size={13} color={colors.mute}>{ROLES[me?.user.role ?? ""] ?? me?.user.role} at {me?.agency?.name}</T></View>
        </View>
      </SafeAreaView>
      <View style={styles.sections}>
        {photoQueue?.scope === scope && photoQueue.count > 0 ? <NavigationGroup title="Saved on this phone"><NavigationRow label="Incident photos waiting" detail={`${photoQueue.count} saved · open to retry uploads`} icon="image" onPress={() => router.push("/report")} /></NavigationGroup> : null}
        <NavigationGroup title="My work">
          {me?.user.isStaff ? <NavigationRow label="My schedule and time" icon="calendar" onPress={() => router.push("/my-time")} /> : null}
          <NavigationRow label="My tasks" icon="check-square" onPress={() => router.push("/tasks")} />
          <NavigationRow label="My documents" icon="file-text" onPress={() => router.push("/documents")} />
        </NavigationGroup>
        <NavigationGroup title="Care tools">
          <NavigationRow label={me?.user.role === "nurse" ? "People and clinical care" : "People and care"} icon="users" onPress={() => router.push("/people")} />
          <NavigationRow label="Appointments and follow-ups" icon="calendar" onPress={() => router.push("/appointments")} />
          <NavigationRow label="Report an incident" icon="alert-triangle" danger onPress={() => router.push("/report")} />
          {me?.features.assistant ? <NavigationRow label="Ask Mohuddle" icon="message-circle" onPress={() => router.push("/ask")} /> : null}
        </NavigationGroup>
        {me?.user.canManage ? <NavigationGroup title="Management">
          <NavigationRow label="Team overview" icon="users" onPress={() => router.push("/team")} />
          <NavigationRow label="Approvals" icon="inbox" onPress={() => router.push("/approvals")} />
          <NavigationRow label="Schedule and coverage" icon="calendar" onPress={() => router.push("/manager-schedule")} />
          <NavigationRow label="Create and assign tasks" icon="check-square" onPress={() => router.push("/manage-tasks")} />
        </NavigationGroup> : null}
        {administration.length ? <NavigationGroup>
          <NavigationRow label="Website administration" detail="Homes, staff, office setup and business settings" icon="settings" expanded={administrationOpen} onPress={() => setAdministrationOpen(!administrationOpen)} />
          {administrationOpen ? <View><T size={12} color={colors.mute} style={styles.help}>Opens your browser. You may need to sign in. Check that the selected agency is {me?.agency?.name}.</T>{administration.map(link => <View key={link.path} style={styles.subrow}><NavigationRow label={link.label} icon="globe" external onPress={() => void openWebsite(link.path)} /></View>)}</View> : null}
        </NavigationGroup> : null}
        <NavigationGroup title="Account">
          <NavigationRow label="Signed in as" detail={me?.user.email} icon="mail" />
          {push ? <View>
            <NavigationRow label="Notifications" detail={pushDescription} icon={push === "on" ? "bell" : "bell-off"} expanded={notificationsOpen} onPress={() => setNotificationsOpen(!notificationsOpen)} />
            {notificationsOpen ? <View style={styles.help}>
              {push === "on" ? <Button label="Turn off notifications" tone="ghost" busy={pushBusy} onPress={() => changePush(false)} /> : null}
              {push === "off" ? <Button label="Turn on notifications" tone="ghost" icon="bell" busy={pushBusy} onPress={() => changePush(true)} /> : null}
              {push === "denied" ? <Button label="Open phone settings" tone="ghost" icon="settings" onPress={() => Linking.openSettings()} /> : null}
              {push === "unsupported" ? <T size={13} color={colors.mute}>Notifications work in the Mohuddle app on a supported phone.</T> : null}
            </View> : null}
          </View> : null}
          {others.length ? <View><T weight="semibold" size={13} color={colors.mute} style={styles.help}>Switch agency</T>{others.map(agency => <NavigationRow key={agency.agencyId} label={agency.name} detail={busy === agency.agencyId ? "Switching…" : undefined} icon="repeat" disabled={Boolean(busy)} onPress={() => void switchTo(agency.agencyId)} />)}</View> : null}
          <NavigationRow label="Keeping records private" detail={`Locks after ${me?.rules.lockMinutes ?? 5} minutes away. Unlock with your PIN${biometricsOn ? ", face or fingerprint" : ""}. Your office can sign out a lost phone.`} icon="shield" />
          <AppUpdates unsent={unsent} />
        </NavigationGroup>
        <ErrorText>{error}</ErrorText>
        {unsent ? <ErrorText>{unsent} {unsent === 1 ? "dose is" : "doses are"} saved on this phone and not sent yet. Stay signed in until you have a signal, or they will not reach the medication record.</ErrorText> : null}
        <NavigationGroup><NavigationRow label={unsent && !sure ? "Sign out anyway" : unsent ? "Tap again to sign out" : "Sign out"} icon="log-out" danger onPress={() => (unsent && !sure ? setSure(true) : signOut())} /></NavigationGroup>
        <T size={12} color={colors.dim} style={{ textAlign: "center" }}>Mohuddle {Constants.expoConfig?.version} · {API_URL.replace(/^https?:\/\//, "")}</T>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  scroll: { paddingBottom: 140 },
  hero: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 20 },
  profile: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  sections: { paddingHorizontal: 20, gap: 24 },
  subrow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  help: { padding: 16, paddingTop: 8 },
});
