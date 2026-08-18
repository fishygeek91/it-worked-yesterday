import { describe, expect, it } from "vitest";

const E2E_SOURCES = import.meta.glob("../e2e/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("e2e imports", () => {
  it("does not import mutations, the suite, or core", () => {
    const files = Object.entries(E2E_SOURCES);
    expect(files.length).toBeGreaterThan(0);
    for (const [file, text] of files) {
      if (typeof text !== "string") {
        throw new Error(`expected raw source for ${file}`);
      }
      const imports = text.match(/^import .+$/gm) ?? [];
      expect(imports.length, file).toBeGreaterThan(0);
      for (const line of imports) {
        expect(line, file).not.toMatch(/bugs/);
        expect(line, file).not.toMatch(/suite/);
        expect(line, file).not.toMatch(/\/src\/core/);
      }
    }
  });
});
