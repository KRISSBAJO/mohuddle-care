import { useState } from "react";
import { Platform } from "react-native";
import * as Updates from "expo-updates";
import { colors } from "@/lib/theme";
import { Button, Card, ErrorText, T } from "./ui";

export function AppUpdates({ unsent }: { unsent: number }) {
  const { isUpdatePending } = Updates.useUpdates();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (Platform.OS === "web" || !Updates.isEnabled) return null;

  async function check() {
    setBusy(true);
    setError("");
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        setMessage("Your update is ready. Restart when you have finished your work.");
      } else setMessage("You have the latest version.");
    } catch {
      setError("Could not check for updates. Try again when you have a connection.");
    } finally { setBusy(false); }
  }

  async function restart() {
    setError("");
    try { await Updates.reloadAsync(); }
    catch { setError("Close and reopen Mohuddle to finish the update."); }
  }

  return <Card style={{ gap: 10 }}>
    <T weight="semibold">App updates</T>
    <T size={13} color={colors.mute}>{message || (isUpdatePending ? "An update is ready. Restart when you have finished your work." : "Small improvements arrive without reinstalling the app.")}</T>
    <ErrorText>{error}</ErrorText>
    {isUpdatePending ? <><Button label="Restart to update" icon="refresh-cw" disabled={unsent > 0} onPress={restart} />{unsent > 0 && <T size={13} color={colors.mute}>Send your saved doses before restarting.</T>}</> : <Button label="Check for updates" icon="download" tone="ghost" busy={busy} onPress={check} />}
  </Card>;
}
