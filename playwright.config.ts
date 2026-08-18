import { defineConfig } from "@playwright/test";

/**
 * Playwright is installed in Phase 0. Specs land in TASK 13.
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
    reuseExistingServer: process.env["CI"] === undefined,
  },
});
