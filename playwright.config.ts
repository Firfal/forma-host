import { defineConfig, devices } from "@playwright/test";

// Lancé par `npm run test:e2e` : émulateurs + données de démo, puis Next.js en mode dev.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    locale: "fr-FR",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    command: "next dev -p 3100",
    url: "http://localhost:3100/connexion",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_USE_EMULATORS: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
