import { Redirect, useLocalSearchParams } from "expo-router";

/** Older links open the combined Manage Schedule screen on that service. */
export default function ManageServiceSchedule() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  if (mode !== "clinic" && mode !== "online" && mode !== "home")
    return <Redirect href="/schedule" />;
  return <Redirect href={{ pathname: "/schedule", params: { mode } }} />;
}
