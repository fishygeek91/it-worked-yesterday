import { describe, expect, it } from "vitest";

import { generateBuggyHistory, runSuite } from "../src/core";
import { assertPersistence, countFirstBads } from "./helpers";

describe("generator persistence", () => {
  it("keeps exactly one first-bad and paints every descendant red", () => {
    const generated = generateBuggyHistory({
      suspectCount: 8,
      firstBadIndex: 3,
      seed: 7,
      mutation: "offByOneLoopBound",
    });
    expect(countFirstBads(generated.repo)).toBe(1);
    assertPersistence(generated.repo, generated.firstBad);
    expect(runSuite(generated.repo.commits[generated.knownGood]?.tree ?? {}).ok).toBe(true);
    expect(runSuite(generated.repo.commits[generated.knownBad]?.tree ?? {}).ok).toBe(false);
  });

  it("is identical for the same seed", () => {
    const input = {
      suspectCount: 16,
      firstBadIndex: 9,
      seed: 1729,
      mutation: "offByOneLoopBound" as const,
    };
    const a = generateBuggyHistory(input);
    const b = generateBuggyHistory(input);
    expect(a.repo.order).toEqual(b.repo.order);
    expect(a.firstBad).toBe(b.firstBad);
  });
});
