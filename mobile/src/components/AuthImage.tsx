import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";
import { colors } from "@/lib/theme";

/*
 * A private picture that needs the phone's sign-in to load, such as an incident or chat photo. On a
 * phone the image request carries the token; the browser preview fetches it first instead.
 */
export function AuthImage({ url, token, label, style, resizeMode = "cover" }: { url: string; token: string | null; label: string; style?: StyleProp<ImageStyle>; resizeMode?: "cover" | "contain" }) {
  const [webUri, setWebUri] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !token) return;
    let made = "";
    fetch(url, { headers: { authorization: `Bearer ${token}` } })
      .then(response => (response.ok ? response.blob() : null))
      .then(blob => {
        if (!blob) return;
        made = URL.createObjectURL(blob);
        setWebUri(made);
      })
      .catch(() => undefined);
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [url, token]);
  const source = Platform.OS === "web" ? (webUri ? { uri: webUri } : null) : { uri: url, headers: { authorization: `Bearer ${token ?? ""}` } };
  return (
    <View style={[styles.box, style as object]}>
      {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode={resizeMode} accessibilityLabel={label} /> : <ActivityIndicator color={colors.brand} />}
    </View>
  );
}

const styles = StyleSheet.create({ box: { overflow: "hidden", backgroundColor: "#eceee8", alignItems: "center", justifyContent: "center" } });
