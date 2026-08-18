import { describe, expect, it } from "vitest";

import { GameError, generateBuggyHistory, mulberry32, type MutationId, type Rng } from "../src/core";
import { assertPersistence, countFirstBads, optimalAccuse } from "./helpers";

const MUTATION_IDS: readonly MutationId[] = [
  "offByOneLoopBound",
  "flippedBoolean",
  "regexMissingEscape",
  "wrongFixtureValue",
  "brokenComparison",
  "missingReturn",
  "invertedSortComparator",
  "sliceFencepost",
];

/**
 * Pick one authored mutation from the seeded stream.
 * Why a table + nextInt: TASK 3 varies mutation without Math.random.
 *
 * @param rng - Seeded PRNG
 */
function pickMutation(rng: Rng): MutationId {
  const id = MUTATION_IDS[rng.nextInt(MUTATION_IDS.length)];
  if (id === undefined) {
    throw new GameError("INVALID_INDEX", "fuzz: empty mutation table");
  }
  return id;
}

describe("seeded fuzz (start of the bar)", () => {
  it("holds the first-bad invariants on 50 seeds", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const rng = mulberry32(seed);
      const suspectCount = 8 + rng.nextInt(25);
      const firstBadIndex = rng.nextInt(suspectCount);
      const generated = generateBuggyHistory({
        suspectCount,
        firstBadIndex,
        seed,
        mutation: "offByOneLoopBound",
      });
      expect(countFirstBads(generated.repo), `seed ${String(seed)} first-bad count`).toBe(1);
      assertPersistence(generated.repo, generated.firstBad);
      expect(optimalAccuse(generated), `seed ${String(seed)} accuse`).toBe(generated.firstBad);
    }
  });
});

describe("seeded fuzz (200)", () => {
  it("holds the first-bad invariants on 200 seeds across all mutations", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = mulberry32(seed);
      const suspectCount = 8 + rng.nextInt(25);
      const firstBadIndex = rng.nextInt(suspectCount);
      const mutation = pickMutation(rng);
      const generated = generateBuggyHistory({
        suspectCount,
        firstBadIndex,
        seed,
        mutation,
      });
      expect(countFirstBads(generated.repo), `seed ${String(seed)} first-bad count`).toBe(1);
      assertPersistence(generated.repo, generated.firstBad);
      expect(optimalAccuse(generated), `seed ${String(seed)} accuse`).toBe(generated.firstBad);
    }
  });
});
