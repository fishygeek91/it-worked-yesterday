import { defineConfig } from "@playwright/test";

/**
 * Preview the built app. Specs drive the UI; they do not import the suite.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
    port: 4173,
    timeout: 120000,
    reuseExistingServer: process.env["CI"] === undefined,
  },
});
