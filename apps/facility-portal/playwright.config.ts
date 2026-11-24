import { defineConfig, devices } from "@playwright/test";
import { fixtureBackendURL } from "./tests/e2e/support/config";

const portalURL = "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: portalURL,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/e2e/support/supabase.mjs",
      url: `${fixtureBackendURL}/health`,
      env: { FACILITY_E2E_BACKEND_URL: fixtureBackendURL },
    },
    {
      command: "pnpm dev --hostname localhost --port 3100",
      url: `${portalURL}/login`,
      env: {
        FACILITY_E2E: "1",
        NEXT_PUBLIC_SUPABASE_URL: fixtureBackendURL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
        NEXT_PUBLIC_POSTHOG_KEY: "",
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
        GOOGLE_GEOCODING_API_KEY: "",
      },
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
