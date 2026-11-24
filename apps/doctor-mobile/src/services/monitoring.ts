import PostHog from "posthog-react-native";
import { scrubEventData, setErrorReporter } from "@startup/data-access";

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();

// Error monitoring only: no identification, screens, lifecycle, replay or geo.
// Without a key nothing is initialised and no data leaves the device.
export const monitoring = apiKey
  ? new PostHog(apiKey, {
      host:
        process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() ||
        "https://us.i.posthog.com",
      personProfiles: "never",
      disableGeoip: true,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      errorTracking: {
        autocapture: {
          uncaughtExceptions: true,
          unhandledRejections: true,
          console: false,
        },
      },
      // Only exception events are sent, with personal data scrubbed.
      before_send: (event) =>
        event?.event === "$exception" ? scrubEventData(event) : null,
    })
  : null;

if (monitoring)
  setErrorReporter((error, context) =>
    monitoring.captureException(error, { app: "doctor-mobile", ...context })
  );
