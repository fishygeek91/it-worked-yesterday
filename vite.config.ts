import { defineConfig } from "vitest/config";

/**
 * Shared Vite + Vitest config so the browser app and Node tests
 * resolve the same TypeScript.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
