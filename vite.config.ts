import { defineConfig } from "vitest/config";

/**
 * Shared Vite + Vitest config so the browser app and Node tests
 * resolve the same TypeScript.
 */
export default defineConfig({
  // Project Pages lives at /it-worked-yesterday/. Local and e2e stay at /.
  base: process.env["GITHUB_PAGES"] === "1" ? "/it-worked-yesterday/" : "/",
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
