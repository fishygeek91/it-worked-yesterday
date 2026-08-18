import { describe, expect, it } from "vitest";

import { firstChangedFile, generateBuggyHistory } from "../src/core";

describe("firstChangedFile", () => {
  it("names the mutated file and the off-by-one line, not the salt", () => {
    const generated = generateBuggyHistory({
      suspectCount: 8,
      firstBadIndex: 3,
      seed: 1729,
      mutation: "offByOneLoopBound",
    });
    const bad = generated.repo.commits[generated.firstBad];
    if (bad === undefined || bad.parent === null) {
      throw new Error("tutorial first-bad needs a parent");
    }
    const parent = generated.repo.commits[bad.parent];
    if (parent === undefined) {
      throw new Error("tutorial first-bad parent missing");
    }
    const hunk = firstChangedFile(parent.tree, bad.tree);
    expect(hunk).not.toBeNull();
    if (hunk === null) {
      throw new Error("expected a file hunk");
    }
    expect(hunk.path).toBe("src/collect.ts");
    expect(hunk.path).not.toBe("meta/note.txt");
    const texts = hunk.lines.map((line) => line.text).join("\n");
    expect(texts).toContain("i < xs.length");
    expect(texts).toContain("i <= xs.length");
    expect(hunk.lines.some((line) => line.kind === "del")).toBe(true);
    expect(hunk.lines.some((line) => line.kind === "add")).toBe(true);
  });
});
