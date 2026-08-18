import { describe, expect, it } from "vitest";

import {
  commitAt,
  descendants,
  diamondLayout,
  generateBuggyHistory,
  generateDiamondHistory,
  runSuite,
  type DiamondLane,
  type Repo,
  type Sha,
} from "../src/core";

/**
 * Count red commits whose every parent is green. The DAG first-bad.
 *
 * @param repo - Planted repo
 */
function countDagFirstBads(repo: Repo): number {
  let count = 0;
  for (const sha of repo.order) {
    const commit = commitAt(repo, sha);
    if (runSuite(commit.tree).ok) {
      continue;
    }
    const parentsGreen = commit.parents.every((parent) => runSuite(commitAt(repo, parent).tree).ok);
    if (commit.parents.length === 0 || parentsGreen) {
      count += 1;
    }
  }
  return count;
}

/**
 * SHA at an order index, or throw.
 *
 * @param repo - Repo
 * @param index - Order index
 */
function shaAt(repo: Repo, index: number): Sha {
  const sha = repo.order[index];
  if (sha === undefined) {
    throw new Error(`missing sha at ${String(index)}`);
  }
  return sha;
}

describe("diamond generator", () => {
  it("plants exactly one first-bad on either lane with DAG persistence", () => {
    const lanes: readonly DiamondLane[] = ["trunk", "branch"];
    for (const firstBadLane of lanes) {
      const generated = generateDiamondHistory({
        suspectCount: 8,
        seed: 1729,
        mutation: "missingReturn",
        firstBadLane,
        firstBadOnLane: 1,
      });
      expect(countDagFirstBads(generated.repo)).toBe(1);
      const red = new Set(descendants(generated.repo, generated.firstBad));
      expect(red.has(generated.firstBad)).toBe(true);
      expect(red.has(generated.knownBad)).toBe(true);
      for (const sha of generated.repo.order) {
        const ok = runSuite(commitAt(generated.repo, sha).tree).ok;
        expect(ok, sha).toBe(!red.has(sha));
      }
      const layout = diamondLayout(8);
      const otherLane = firstBadLane === "trunk" ? layout.branchIndices : layout.trunkIndices;
      for (const index of otherLane) {
        const sha = shaAt(generated.repo, index);
        expect(runSuite(commitAt(generated.repo, sha).tree).ok).toBe(true);
        expect(red.has(sha)).toBe(false);
      }
      const merge = shaAt(generated.repo, layout.mergeIndex);
      expect(runSuite(commitAt(generated.repo, merge).tree).ok).toBe(false);
      expect(red.has(merge)).toBe(true);
    }
  });

  it("is deterministic and keeps linear histories byte-identical", () => {
    const input = {
      suspectCount: 8,
      seed: 99,
      mutation: "missingReturn" as const,
      firstBadLane: "branch" as const,
      firstBadOnLane: 0,
    };
    const a = generateDiamondHistory(input);
    const b = generateDiamondHistory(input);
    expect(a.repo.order).toEqual(b.repo.order);
    expect(a.firstBad).toBe(b.firstBad);
    for (const sha of a.repo.order) {
      expect(commitAt(a.repo, sha).tree).toEqual(commitAt(b.repo, sha).tree);
    }

    const linearInput = {
      suspectCount: 8,
      firstBadIndex: 3,
      seed: 1729,
      mutation: "offByOneLoopBound" as const,
    };
    const linear = generateBuggyHistory(linearInput);
    const again = generateBuggyHistory(linearInput);
    expect(linear.repo.order).toEqual(again.repo.order);
    expect(linear.firstBad).toBe(again.firstBad);
    for (const sha of linear.repo.order) {
      const commit = commitAt(linear.repo, sha);
      expect(commit.parents).toEqual(commit.parent === null ? [] : [commit.parent]);
    }
  });
});
