import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScreenBar } from "@/components/ScreenBar";
import { Button, ErrorText, Icon, Section, T } from "@/components/ui";
import { ApiError, type PersonFacts } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

/* A labelled fact, left out when empty. */
function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={{ gap: 2 }}>
      <T size={12} weight="semibold" color={colors.mute} style={{ letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </T>
      <T>{value}</T>
    </View>
  );
}

/* A person's key facts for staff on shift: view only, and not kept on the phone. */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [facts, setFacts] = useState<PersonFacts | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    call<PersonFacts>(`/people/${id}`).then(setFacts, problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."));
  }, [call, id]);

  if (!facts)
    return (
      <View style={styles.page}>
        <ScreenBar title="" />
        <View style={{ padding: 20 }}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.brand} />}</View>
      </View>
    );

  const initials = facts.name
    .split(" ")
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const about = [facts.age !== null ? `${facts.age} years` : null, facts.pronouns || null, facts.home].filter(Boolean).join(" · ");

  return (
    <View style={styles.page}>
      <ScreenBar title={facts.preferredName || facts.name.split(" ")[0]} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, shadow.soft]}>
          <View style={styles.avatar}>
            <T weight="bold" size={22} color={colors.lime}>
              {initials}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T weight="bold" size={20} style={{ letterSpacing: -0.4 }}>
              {facts.name}
            </T>
            {facts.preferredName ? (
              <T size={14} color={colors.mute}>
                Likes to be called {facts.preferredName}
              </T>
            ) : null}
            <T size={13} color={colors.mute}>
              {about}
            </T>
          </View>
        </View>

        {facts.allergies ? (
          <View style={[styles.alert, shadow.soft]}>
            <Icon name="alert-circle" size={18} color={colors.flag} />
            <View style={{ flex: 1 }}>
              <T weight="bold" color={colors.flag}>
                Allergies
              </T>
              <T color={colors.flag}>{facts.allergies}</T>
            </View>
          </View>
        ) : null}

        <Section title="How to support them">
          <Fact label="Communication" value={facts.communication} />
          <Fact label="Language" value={facts.language} />
          <Fact label="Mobility" value={facts.mobility} />
          <Fact label="Diet" value={facts.diet} />
          <Fact label="Likes" value={facts.likes} />
          <Fact label="Support notes" value={facts.supportNotes} />
          <Fact label="Diagnoses" value={facts.diagnoses} />
        </Section>

        {facts.contacts.length ? (
          <Section title="Contacts">
            {facts.contacts.map(contact => (
              <Pressable key={contact.role} accessibilityRole="button" disabled={!contact.phone} onPress={() => Linking.openURL(`tel:${contact.phone.replace(/[^0-9+]/g, "")}`)} style={styles.contact}>
                <View style={{ flex: 1 }}>
                  <T size={12} weight="semibold" color={colors.mute}>
                    {contact.role.toUpperCase()}
                  </T>
                  <T weight="semibold">{contact.name}</T>
                  {contact.phone ? (
                    <T size={14} color={colors.sage}>
                      {contact.phone}
                    </T>
                  ) : null}
                </View>
                {contact.phone ? (
                  <View style={styles.call}>
                    <Icon name="phone" size={18} color={colors.brand} />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </Section>
        ) : null}

        <Section title={`Medicines (${facts.medications.length})`}>
          {facts.medications.length === 0 ? (
            <T color={colors.mute}>No medicines on record.</T>
          ) : (
            facts.medications.map(med => (
              <View key={med.id} style={{ gap: 2 }}>
                <T weight="semibold">
                  {med.name} {med.dose}
                  {med.controlled ? <T color={colors.flag}> · Controlled</T> : null}
                </T>
                <T size={13} color={colors.mute}>
                  {med.route} · {med.when}
                  {med.instructions ? ` · ${med.instructions}` : ""}
                </T>
              </View>
            ))
          )}
        </Section>

        {facts.goals.length ? (
          <Section title="Plan goals">
            {facts.goals.map(goal => (
              <View key={goal.id} style={{ gap: 2 }}>
                <T weight="semibold">{goal.title}</T>
                {goal.measurableStep ? (
                  <T size={13} color={colors.mute}>
                    {goal.measurableStep}
                  </T>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {facts.appointments.length ? (
          <Section title="Coming up">
            {facts.appointments.map(visit => (
              <View key={visit.id} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Icon name="calendar" size={16} color={colors.sage} />
                <T style={{ flex: 1 }}>
                  {visit.type}
                  {visit.clinic ? ` at ${visit.clinic}` : ""}
                </T>
                <T size={13} color={colors.mute}>
                  {fmt.dayShort(visit.scheduledAt, zone)}, {fmt.time(visit.scheduledAt, zone)}
                </T>
              </View>
            ))}
          </Section>
        ) : null}
        {facts ? <><Button label="Health history and care team" tone="ghost" onPress={() => router.push({ pathname: "/health", params: { id: facts.id } })} /><Button label="All appointments and follow-ups" tone="ghost" onPress={() => router.push({ pathname: "/appointments", params: { person: facts.id } })} /></> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  scroll: { padding: 20, paddingTop: 8, gap: 14, paddingBottom: 48 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderRadius: 24, padding: 18 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  alert: { flexDirection: "row", gap: 12, backgroundColor: colors.flagSoft, borderRadius: 20, padding: 16 },
  contact: { flexDirection: "row", alignItems: "center", gap: 12 },
  call: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.wash, alignItems: "center", justifyContent: "center" },
});
