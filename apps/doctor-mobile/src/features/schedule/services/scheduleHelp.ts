import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// The schedule tip is shown until the doctor dismisses it once.
const storageKey = "clinzo-doctor-schedule-help-dismissed";

export async function isScheduleHelpDismissed(): Promise<boolean> {
  try {
    if (Platform.OS === "web")
      return globalThis.localStorage?.getItem(storageKey) === "1";
    return (await SecureStore.getItemAsync(storageKey)) === "1";
  } catch {
    return false;
  }
}

export async function dismissScheduleHelp() {
  try {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(storageKey, "1");
      return;
    }
    await SecureStore.setItemAsync(storageKey, "1");
  } catch {
    // Not remembering the dismissal only means the tip shows again.
  }
}
