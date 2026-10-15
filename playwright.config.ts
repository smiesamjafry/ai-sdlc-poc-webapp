import { defineConfig, devices } from "@playwright/test";

// Regression suite for the app's own behaviour. ASDLC acceptance tests live in
// e2e/asdlc/ and run under the ASDLC harness config, not this one.
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["asdlc/**"],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:4173/" },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run build && npm run preview", url: "http://localhost:4173/", reuseExistingServer: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
