import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Fragment, useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chips, ErrorText, Icon, Section, T } from "@/components/ui";
import { ApiError, type NotesOwed } from "@/lib/api";
import { type NoteInbox, type NoteRow } from "@/lib/note-workflow";
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
  const scope = `${me?.agency?.id}.${me?.user.id}`;
  const [loaded, setLoaded] = useState<{ scope: string; data: NotesOwed; inbox: NoteInbox } | null>(null);
  const data = loaded?.scope === scope ? loaded.data : null;
  const inbox = loaded?.scope === scope ? loaded.inbox : null;
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([call<NotesOwed>("/notes"), call<NoteInbox>("/notes/workflow")]).then(
        ([result, workflow]) => {
          setLoaded({ scope, data: result, inbox: workflow });
          setError("");
        },
        problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
      ),
    [call, scope],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function row(note: NoteRow) {
    return <Pressable key={`${note.kind}.${note.id}`} accessibilityRole="button" onPress={() => router.push({ pathname: "/note-record", params: { id: note.id, kind: note.kind } })} style={{ paddingVertical: 12, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }}>
      <T weight="semibold">{note.person}</T><T size={13} color={colors.mute}>{note.day} · {note.kind === "daily" ? "Shift" : "Community"} · {note.status ?? "Returned"}</T>
      {note.reason ? <T size={13} color={colors.flag}>{note.reason}</T> : null}
      {note.flags?.length ? <T size={12} color={colors.flag}>Check: {note.flags.join(", ").replace(/_/g, " ")}</T> : null}
    </Pressable>;
  }
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
            Notes
          </T>
          <T size={14} color={colors.mute}>
            {data ? (missing ? `${missing} still to write` : data.shifts.length ? "All written. Thank you." : "Nothing to write") : " "}
          </T>
        </SafeAreaView>

        {inbox ? <View style={{ marginHorizontal: 20, gap: 14, marginBottom: 14 }}>
          <Button label="Write a shift note" icon="edit-3" onPress={() => setChoosing(!choosing)} />
          {choosing ? <Section title="Choose a person"><Chips options={inbox.people.map(person => [person.id, person.name] as const)} value="" onChange={next => { if (typeof next === "string" && next) router.push({ pathname: "/note", params: { person: next } }); }} /></Section> : null}
          <Button label="Write a Community Participation note" icon="edit-3" onPress={() => router.push("/community-note")} />
          {inbox.returned.length ? <Section title="Returned to you" tone="warn">{inbox.returned.map(row)}</Section> : null}
          {inbox.review.length ? <Section title="Waiting for your review">{inbox.review.map(row)}</Section> : null}
        </View> : null}
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
                    {fmt.dayShort(shift.startsAt, zone)} Â· {shift.pattern}
                  </T>
                  <T size={13} color={colors.mute}>
                    {shift.home} Â· {fmt.time(shift.startsAt, zone)} â€“ {fmt.time(shift.endsAt, zone)}
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
                    onPress={() => person.logId ? router.push({ pathname: "/note-record", params: { id: person.logId, kind: "daily" } }) : router.push({ pathname: "/note", params: { person: person.id, shift: shift.shiftId } })}
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
                        Read note
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
        {inbox?.recent.length ? <View style={{ margin: 20 }}><Section title="Your notes · last 30 days">{inbox.recent.map(row)}</Section></View> : null}
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
