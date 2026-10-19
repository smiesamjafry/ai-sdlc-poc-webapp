import { defineConfig, devices } from "@playwright/test";

// E2E runs the real stack: the API (against a seeded e2e database) plus a production build of the SPA.
// CI provides Postgres/Redis as service containers; locally `npm run setup` starts them with Docker.
// ASDLC acceptance tests live in e2e/asdlc/ and run under the ASDLC harness config, not this one.
const DB = process.env.E2E_DATABASE_URL ?? "postgres://pocket:pocket@localhost:55432/pocket_e2e";
const REDIS = process.env.REDIS_URL ?? "redis://localhost:56379";

export default defineConfig({
  testDir: "e2e",
  testIgnore: ["asdlc/**"],
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:4173/" },
  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: "node scripts/e2e-api.mjs",
          url: "http://localhost:4100/healthz",
          reuseExistingServer: false,
          timeout: 120_000,
          env: { DATABASE_URL: DB, REDIS_URL: REDIS },
        },
        {
          command: "npm run build && npm run preview",
          url: "http://localhost:4173/",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { VITE_API_URL: "http://localhost:4100" },
        },
      ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: ["asdlc/**", "**/*.serial.spec.ts"] },
    { name: "serial", use: { ...devices["Desktop Chrome"] }, testMatch: "**/*.serial.spec.ts", dependencies: ["chromium"] },
  ],
});
