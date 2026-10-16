import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Fragment, useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText, Icon, T } from "@/components/ui";
import { ApiError, type NotesOwed } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

const STATE = {
  in_progress: { words: "On shift now", bg: colors.sageSoft, fg: colors.sage },
  due: { words: "Due", bg: "#fdf0dc", fg: "#9a6212" },
  overdue: { words: "Overdue", bg: colors.flagSoft, fg: colors.flag },
};

/* Shift notes: each recent shift, and who still needs a note. */
export default function NotesScreen() {
  const { call, me } = useSession();
  const zone = me?.agency?.zone;
  const [data, setData] = useState<NotesOwed | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      call<NotesOwed>("/notes").then(
        result => {
          setData(result);
          setError("");
        },
        problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
      ),
    [call],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const missing = (data?.shifts ?? []).reduce((sum, shift) => sum + shift.people.filter(person => !person.logId).length, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        <SafeAreaView edges={["top"]} style={styles.header}>
          <T weight="bold" size={24} style={{ letterSpacing: -0.6 }}>
            Shift notes
          </T>
          <T size={14} color={colors.mute}>
            {data ? (missing ? `${missing} still to write` : data.shifts.length ? "All written. Thank you." : "Nothing to write") : " "}
          </T>
        </SafeAreaView>

        {error ? (
          <View style={{ marginHorizontal: 20 }}>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : null}

        {data && data.shifts.length === 0 ? (
          <View style={[styles.card, styles.empty, shadow.soft]}>
            <Icon name="calendar" size={22} color={colors.mute} />
            <T weight="semibold" style={{ marginTop: 8 }}>
              No recent shifts
            </T>
            <T size={13} color={colors.mute} style={{ textAlign: "center" }}>
              Notes are written for each person at the home, for every shift you work.
            </T>
          </View>
        ) : null}

        {(data?.shifts ?? []).map(shift => {
          const look = STATE[shift.state];
          const done = shift.people.filter(person => person.logId).length;
          return (
            <View key={shift.shiftId} style={[styles.card, shadow.soft]}>
              <View style={styles.shiftHead}>
                <View style={{ flex: 1 }}>
                  <T weight="bold" size={16}>
                    {fmt.dayShort(shift.startsAt, zone)} · {shift.pattern}
                  </T>
                  <T size={13} color={colors.mute}>
                    {shift.home} · {fmt.time(shift.startsAt, zone)} – {fmt.time(shift.endsAt, zone)}
                  </T>
                </View>
                <View style={[styles.state, { backgroundColor: done === shift.people.length ? colors.sageSoft : look.bg }]}>
                  <T weight="semibold" size={12} color={done === shift.people.length ? colors.sage : look.fg}>
                    {done === shift.people.length ? "Done" : shift.state === "in_progress" ? look.words : `${look.words} ${fmt.time(shift.dueBy, zone)}`}
                  </T>
                </View>
              </View>
              {shift.people.map((person, index) => (
                <Fragment key={person.id}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(person.logId)}
                    onPress={() => router.push({ pathname: "/note", params: { person: person.id, shift: shift.shiftId } })}
                    style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[styles.mark, person.logId ? { backgroundColor: colors.sageSoft } : { backgroundColor: colors.ground }]}>
                      <Icon name={person.logId ? "check" : "edit-3"} size={16} color={person.logId ? colors.sage : colors.brand} />
                    </View>
                    <T weight="semibold" style={{ flex: 1 }}>
                      {person.name}
                    </T>
                    {person.logId ? (
                      <T size={13} color={colors.sage}>
                        Written
                      </T>
                    ) : (
                      <View style={styles.write}>
                        <T weight="semibold" size={13} color="#ffffff">
                          Write
                        </T>
                      </View>
                    )}
                  </Pressable>
                </Fragment>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  card: { marginHorizontal: 20, marginBottom: 14, backgroundColor: colors.card, borderRadius: 24, overflow: "hidden" },
  empty: { alignItems: "center", padding: 24 },
  shiftHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  state: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  mark: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 62 },
  write: { backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
});
