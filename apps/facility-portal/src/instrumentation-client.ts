import posthog from "posthog-js";
import { scrubEventData, setErrorReporter } from "@startup/data-access";

const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();

// Error monitoring only: no autocapture, page views, replay, surveys or
// person profiles, and nothing is stored in the browser. Without a key the
// SDK is not initialised and no data leaves the browser.
if (apiKey) {
  posthog.init(apiKey, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
      "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    person_profiles: "never",
    persistence: "memory",
    capture_exceptions: true,
    // Only exception events are sent, with personal data scrubbed.
    before_send: (event) =>
      event?.event === "$exception" ? scrubEventData(event) : null,
  });
  setErrorReporter((error, context) =>
    posthog.captureException(error, { app: "facility-portal", ...context })
  );
}
