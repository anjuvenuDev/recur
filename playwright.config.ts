import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 30000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "artifacts/browser-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "node --import tsx scripts/dev.ts",
    url: "http://127.0.0.1:3100/api/ready",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      WEB_PORT: "3100",
      RECUR_NEXT_DIST: ".next-e2e",
      DEMO_PORT: "4101",
      DATABASE_URL: `file:${resolve("artifacts/e2e.db")}`,
      OPENAI_API_KEY: "",
      ARGA_ENABLED: "false",
      GITHUB_TOKEN: "",
      LAUNCHDARKLY_SDK_KEY: "",
      USERLENS_WRITE_CODE: "",
      LEMMA_API_KEY: "",
      RECUR_ACCESS_TOKEN: "",
    },
  },
});
