import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { ScreenBar } from "@/components/ScreenBar";
import { SignaturePad, type Drawing } from "@/components/SignaturePad";
import { Button, Check, Chips, ErrorText, Field, Icon, Section, T } from "@/components/ui";
import { API_URL, ApiError, type DocumentToSign } from "@/lib/api";
import { goBack } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

const FONTS = [
  ["apple", "SigApple"],
  ["caveat", "SigCaveat"],
  ["dancing", "SigDancing"],
  ["vibes", "SigVibes"],
] as const;
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);

/*
 * Reading and signing a document on the phone: initial each section where asked, then sign by typing
 * your name in a handwriting font or drawing it with a finger, and agree to sign electronically.
 */
export default function SignScreen() {
  const { item } = useLocalSearchParams<{ item: string }>();
  const { call } = useSession();
  const [doc, setDoc] = useState<DocumentToSign | null>(null);
  const [initialled, setInitialled] = useState<number[]>([]);
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState("");
  const [typedInitials, setTypedInitials] = useState("");
  const [font, setFont] = useState<(typeof FONTS)[number][0]>("apple");
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    call<DocumentToSign>(`/documents/sign/${item}`).then(
      result => {
        setDoc(result);
        if (!result.signed) {
          setTypedName(result.signerName);
          setTypedInitials(initialsOf(result.signerName));
        }
      },
      problem => setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again."),
    );
  }, [call, item]);

  const onDrawing = useCallback((next: Drawing | null) => setDrawing(next), []);

  if (!doc || doc.signed || done || (!doc.signed && doc.kind === "pdf"))
    return (
      <View style={styles.page}>
        <ScreenBar title="Sign" />
        <View style={{ padding: 20, gap: 14 }}>
          {!doc ? (
            error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.brand} />
          ) : (
            <View style={[styles.card, { alignItems: "center", gap: 10 }, shadow.soft]}>
              <Icon name={!doc.signed && doc.kind === "pdf" && !done ? "monitor" : "check-circle"} size={28} color={colors.sage} />
              <T weight="bold" size={18} style={{ textAlign: "center" }}>
                {done ? "Signed" : doc.signed ? "Already signed" : "Sign this one on the website"}
              </T>
              <T color={colors.mute} style={{ textAlign: "center" }}>
                {done || doc.signed ? `${doc.title} is signed and filed. Your coordinator has been told.` : `${doc.title} has places to sign on its pages, which need a bigger screen. Open My documents on the Mohuddle website.`}
              </T>
              {!doc.signed && !done && doc.kind === "pdf" ? <Button label="Open secure website signing" icon="external-link" onPress={() => void Linking.openURL(`${API_URL}/app/my-documents/sign/${encodeURIComponent(item)}`).catch(() => setError("Could not open your browser. Visit My documents on mohuddle.com."))} /> : null}
              <Button label="Back to my documents" tone="ghost" onPress={() => goBack()} />
            </View>
          )}
        </View>
      </View>
    );

  const needInitials = doc.initialEach ? doc.sections.map((_, index) => index).filter(index => !initialled.includes(index)) : [];
  const ready = consent && needInitials.length === 0 && (method === "typed" ? typedName.trim().length > 1 && typedInitials.trim().length > 0 : Boolean(drawing));

  async function sign() {
    if (!doc || doc.signed) return;
    setBusy(true);
    setError("");
    try {
      await call("/documents/sign", {
        itemId: item,
        method,
        typedName,
        typedInitials,
        font,
        signature: method === "drawn" ? drawing : undefined,
        initialsCount: doc.initialEach ? doc.sections.length : 0,
        consent: true,
        consentedAt: new Date().toISOString(),
      });
      setDone(true);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const fontFamily = FONTS.find(([key]) => key === font)?.[1];
  return (
    <View style={styles.page}>
      <ScreenBar title="Sign" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, shadow.soft]}>
            <T weight="bold" size={20} style={{ letterSpacing: -0.4 }}>
              {doc.title}
            </T>
            <T size={13} color={colors.mute}>
              For {doc.signerName}. Read each part{doc.initialEach ? " and initial it" : ""}, then sign at the end.
            </T>
          </View>

          {doc.sections.map((section, index) => (
            <View key={index} style={[styles.card, { gap: 8 }, shadow.soft]}>
              {section.heading ? (
                <T weight="bold" size={16}>
                  {section.heading}
                </T>
              ) : null}
              <T style={{ lineHeight: 22 }}>{section.text.trim()}</T>
              {doc.initialEach ? (
                <Check checked={initialled.includes(index)} onToggle={() => setInitialled(initialled.includes(index) ? initialled.filter(value => value !== index) : [...initialled, index])}>
                  <T weight="semibold" size={14}>
                    I have read this part. Initial: {typedInitials || "…"}
                  </T>
                </Check>
              ) : null}
            </View>
          ))}

          <Section title="Your signature">
            <Chips
              options={[
                ["typed", "Type it"],
                ["drawn", "Draw it"],
              ]}
              value={method}
              onChange={next => setMethod(next === "drawn" ? "drawn" : "typed")}
            />
            {method === "typed" ? (
              <>
                <Field label="Full name" value={typedName} onChangeText={setTypedName} autoCapitalize="words" />
                <Field label="Initials" value={typedInitials} onChangeText={next => setTypedInitials(next.toUpperCase().slice(0, 6))} autoCapitalize="characters" />
                <View style={styles.preview}>
                  <T size={34} color="#1d2b4f" style={{ fontFamily, lineHeight: 52 }} numberOfLines={1}>
                    {typedName || " "}
                  </T>
                </View>
                <View style={styles.fonts}>
                  {FONTS.map(([key, family]) => (
                    <View key={key} style={[styles.font, font === key && { borderColor: colors.brand, backgroundColor: colors.wash }]} onTouchEnd={() => setFont(key)}>
                      <T size={20} color="#1d2b4f" style={{ fontFamily: family }} numberOfLines={1}>
                        {typedName.split(" ")[0] || "Name"}
                      </T>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
                <SignaturePad label="Sign here with your finger" onChange={onDrawing} />
                <Field label="Initials" value={typedInitials} onChangeText={next => setTypedInitials(next.toUpperCase().slice(0, 6))} autoCapitalize="characters" />
              </>
            )}
          </Section>

          <Section title="Agree">
            <Check checked={consent} onToggle={() => setConsent(!consent)}>
              I agree to sign this document electronically, and that my electronic signature is as valid as signing on paper.
            </Check>
          </Section>

          {needInitials.length ? (
            <T size={13} color="#9a6212">
              Initial {needInitials.length === 1 ? "one more part" : `${needInitials.length} more parts`} first.
            </T>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <Button label="Sign the document" icon="edit-2" busy={busy} disabled={!ready} onPress={sign} style={[{ minHeight: 56, borderRadius: 18 }, !ready && { opacity: 0.5 }]} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  scroll: { padding: 20, paddingTop: 8, gap: 14, paddingBottom: 48 },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 18, gap: 4 },
  preview: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 8, alignItems: "center" },
  fonts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  font: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, minWidth: 120, alignItems: "center" },
});
