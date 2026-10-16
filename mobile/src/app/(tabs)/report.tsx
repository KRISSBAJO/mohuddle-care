import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Check, Chips, ErrorText, Field, Icon, Section, styles as ui, T } from "@/components/ui";
import { API_URL, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

type FormData = {
  homeId: string | null;
  people: { id: string; name: string; homeId: string | null; home: string | null }[];
  groups: { key: string; title: string; deadline: string; events: { key: string; label: string; detail?: string }[] }[];
};
type Photo = { uri: string; type: string };

const today = (zone?: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const clock = (zone?: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());

/*
 * Reporting an incident from the phone: who, when, what kind, what happened, any injury, what you
 * did, and photos. The website's Reportable Event Form rules apply; the office completes the rest of
 * the state form on the website. Needs a signal.
 */
export default function ReportScreen() {
  const { call, me, token } = useSession();
  const zone = me?.agency?.zone;
  const [form, setForm] = useState<FormData | null>(null);
  const [person, setPerson] = useState("");
  const [showEveryone, setShowEveryone] = useState(false);
  const [now, setNow] = useState(true);
  const [date, setDate] = useState(() => today(zone));
  const [time, setTime] = useState(() => clock(zone));
  const [events, setEvents] = useState<string[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [witness, setWitness] = useState("");
  const [description, setDescription] = useState("");
  const [injury, setInjury] = useState("");
  const [injuryDetails, setInjuryDetails] = useState("");
  const [actions, setActions] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ tier: string; photosFailed: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!form) call<FormData>("/incidents/form").then(setForm, problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."));
    }, [call, form]),
  );

  const nearby = form?.people.filter(item => form.homeId && item.homeId === form.homeId) ?? [];
  const listed = showEveryone || !nearby.length ? (form?.people ?? []) : nearby;
  const chosenGroups = form?.groups.filter(group => group.events.some(event => events.includes(event.key))) ?? [];
  const urgent = chosenGroups.find(group => group.key === "tier1") ?? chosenGroups.find(group => group.key === "tier2") ?? chosenGroups[0];

  async function addPhoto(fromCamera: boolean) {
    setError("");
    const permission = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError(fromCamera ? "Mohuddle needs the camera to take a photo. Allow it in your phone's settings." : "Mohuddle needs your photos to add one. Allow it in your phone's settings.");
    const options = { mediaTypes: ["images" as const], quality: 0.7, allowsMultipleSelection: !fromCamera, selectionLimit: 6 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    setPhotos(previous => [...previous, ...result.assets.map(asset => ({ uri: asset.uri, type: asset.mimeType ?? "image/jpeg" }))].slice(0, 12));
  }

  async function submit() {
    setError("");
    setBusy("Sending the report…");
    let id: string;
    try {
      const result = await call<{ id: string }>("/incidents", {
        individualId: person,
        occurredDate: now ? today(zone) : date,
        occurredTime: now ? clock(zone) : time,
        witnessType: witness,
        eventTypes: events,
        otherEventText: other,
        description,
        injury,
        injuryDetails,
        actionsTaken: actions,
      });
      id = result.id;
    } catch (problem) {
      setBusy("");
      return setError(problem instanceof ApiError ? (problem.code === "offline" ? "No signal. Incident reports need a signal. Everything you typed is still here; try again when you have one." : problem.message) : "Something went wrong. Try again.");
    }
    // The report is filed; now the photos, one at a time.
    let failed = 0;
    for (const [index, photo] of photos.entries()) {
      setBusy(`Adding photo ${index + 1} of ${photos.length}…`);
      try {
        const blob = await (await fetch(photo.uri)).blob();
        const response = await fetch(`${API_URL}/api/v1/incidents/${id}/photos`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": photo.type || blob.type || "image/jpeg" }, body: blob });
        if (!response.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy("");
    setDone({ tier: urgent?.deadline ?? "", photosFailed: failed });
  }

  function reset() {
    setPerson("");
    setEvents([]);
    setOther("");
    setWitness("");
    setDescription("");
    setInjury("");
    setInjuryDetails("");
    setActions("");
    setPhotos([]);
    setNow(true);
    setDone(null);
  }

  if (done)
    return (
      <SafeAreaView style={[styles.page, { justifyContent: "center", padding: 24 }]}>
        <StatusBar style="dark" />
        <View style={[styles.doneCard, shadow.soft]}>
          <View style={styles.doneIcon}>
            <Icon name="check" size={28} color={colors.sage} />
          </View>
          <T weight="bold" size={22} style={{ textAlign: "center" }}>
            Incident reported
          </T>
          <T color={colors.mute} style={{ textAlign: "center" }}>
            Your manager has been told. You can add anything you learn later on the website.
          </T>
          {done.tier ? (
            <View style={[styles.callout, { backgroundColor: colors.flagSoft }]}>
              <T size={13} weight="semibold" color={colors.flag}>
                {done.tier}
              </T>
            </View>
          ) : null}
          {done.photosFailed ? <ErrorText>{done.photosFailed === 1 ? "One photo" : `${done.photosFailed} photos`} could not be added. Add them on the website.</ErrorText> : null}
          <Button label="Report another" tone="ghost" onPress={reset} />
        </View>
      </SafeAreaView>
    );

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SafeAreaView edges={["top"]} style={{ paddingTop: 16, paddingBottom: 6 }}>
            <T weight="bold" size={24} style={{ letterSpacing: -0.6 }}>
              Report an incident
            </T>
            <T size={14} color={colors.mute}>
              Say what you saw and did. Your manager is told straight away.
            </T>
          </SafeAreaView>

          <Section title="Who was involved">
            <Chips options={listed.map(item => [item.id, item.name] as const)} value={person} onChange={next => setPerson(typeof next === "string" ? next : "")} />
            {nearby.length && !showEveryone ? (
              <Pressable onPress={() => setShowEveryone(true)}>
                <T size={13} weight="semibold" color={colors.sage}>
                  Someone at another home
                </T>
              </Pressable>
            ) : null}
            <T size={12} color={colors.mute}>
              Leave empty if it was not about a person supported, such as damage to the home.
            </T>
          </Section>

          <Section title="When">
            <Chips
              options={[
                ["now", "Just now"],
                ["earlier", "Earlier"],
              ]}
              value={now ? "now" : "earlier"}
              onChange={next => setNow(next !== "earlier")}
            />
            {!now ? (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Date" value={date} onChangeText={setDate} placeholder="2026-10-16" maxLength={10} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Time" value={time} onChangeText={setTime} placeholder="14:30" maxLength={5} />
                </View>
              </View>
            ) : null}
            <Chips
              options={[
                ["witnessed", "I saw it happen"],
                ["discovered", "I found it afterwards"],
              ]}
              value={witness}
              onChange={next => setWitness(typeof next === "string" ? next : "")}
            />
          </Section>

          <Section title="What kind of event" hint="Tick any that fit. Some must reach the state within hours.">
            {form?.groups.map(group => {
              const count = group.events.filter(event => events.includes(event.key)).length;
              const open = openGroup === group.key;
              return (
                <View key={group.key} style={styles.group}>
                  <Pressable accessibilityRole="button" onPress={() => setOpenGroup(open ? null : group.key)} style={styles.groupHead}>
                    <T weight="semibold" style={{ flex: 1 }}>
                      {group.title}
                    </T>
                    {count ? (
                      <View style={styles.count}>
                        <T weight="bold" size={12} color="#ffffff">
                          {count}
                        </T>
                      </View>
                    ) : null}
                    <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.mute} />
                  </Pressable>
                  {open
                    ? group.events.map(event => (
                        <Check key={event.key} checked={events.includes(event.key)} onToggle={() => setEvents(events.includes(event.key) ? events.filter(item => item !== event.key) : [...events, event.key])}>
                          <T size={14}>{event.label}</T>
                          {event.detail ? (
                            <T size={12} color={colors.mute}>
                              {event.detail}
                            </T>
                          ) : null}
                        </Check>
                      ))
                    : null}
                </View>
              );
            })}
            <Field label="Something else (optional)" value={other} onChangeText={setOther} placeholder="A fall with no injury" maxLength={1000} />
            {urgent ? (
              <View style={[styles.callout, { backgroundColor: urgent.key === "tier1" ? colors.flagSoft : "#fdf0dc" }]}>
                <T size={13} weight="semibold" color={urgent.key === "tier1" ? colors.flag : "#9a6212"}>
                  {urgent.title}: {urgent.deadline}
                </T>
              </View>
            ) : null}
          </Section>

          <Section title="What happened" hint="What, when, where, who and why. At least a sentence or two.">
            <TextInput multiline value={description} onChangeText={setDescription} maxLength={8000} placeholder="At 2:30 PM Devon slipped on the wet kitchen floor and fell onto his left side." placeholderTextColor={colors.dim} style={[ui.field, ui.area]} />
          </Section>

          <Section title="Was anyone injured?">
            <Chips
              options={[
                ["yes", "Yes"],
                ["no", "No"],
              ]}
              value={injury}
              onChange={next => setInjury(typeof next === "string" ? next : "")}
            />
            {injury === "yes" ? <TextInput multiline value={injuryDetails} onChangeText={setInjuryDetails} maxLength={3000} placeholder="A bruise on his left hip, about 2 inches" placeholderTextColor={colors.dim} style={[ui.field, ui.area]} /> : null}
          </Section>

          <Section title="What you did">
            <TextInput multiline value={actions} onChangeText={setActions} maxLength={3000} placeholder="Helped him up, checked for injury, applied ice, called the nurse." placeholderTextColor={colors.dim} style={[ui.field, ui.area]} />
          </Section>

          <Section title="Photos (optional)" hint="An injury or damage. Kept private; only staff of the agency can see them.">
            {photos.length ? (
              <View style={styles.photos}>
                {photos.map((photo, index) => (
                  <View key={photo.uri} style={styles.photo}>
                    <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                    <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setPhotos(photos.filter((_, i) => i !== index))} style={styles.remove}>
                      <Icon name="x" size={14} color="#ffffff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Take photo" tone="ghost" icon="camera" onPress={() => addPhoto(true)} style={{ flex: 1 }} />
              <Button label="From library" tone="ghost" icon="image" onPress={() => addPhoto(false)} style={{ flex: 1 }} />
            </View>
          </Section>

          <ErrorText>{error}</ErrorText>
          <Button label={busy || "Send report"} icon="send" busy={Boolean(busy)} onPress={submit} style={{ minHeight: 56, borderRadius: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  scroll: { padding: 20, paddingTop: 0, gap: 14, paddingBottom: 130 },
  group: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  count: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  callout: { borderRadius: 12, padding: 10 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photo: { width: 92, height: 92, borderRadius: 14, overflow: "hidden" },
  photoImage: { width: "100%", height: "100%" },
  remove: { position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  doneCard: { backgroundColor: colors.card, borderRadius: 28, padding: 24, gap: 14, alignItems: "stretch" },
  doneIcon: { alignSelf: "center", width: 60, height: 60, borderRadius: 30, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" },
});
