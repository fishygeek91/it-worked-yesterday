import { accuse, commitAt, indexOfSha, mark, runSuite, start } from "../src/core";
import { GameError } from "../src/core/errors";
import type { GeneratedHistory, Repo, Sha } from "../src/core/types";

/**
 * SHA at an order index, or throw. Tests use this instead of a non-null assertion.
 *
 * @param repo - Linear repo
 * @param index - Order index
 */
export function requireSha(repo: Repo, index: number): Sha {
  const sha = repo.order[index];
  if (sha === undefined) {
    throw new GameError("INVALID_INDEX", `test: no sha at ${String(index)}`);
  }
  return sha;
}

/**
 * Count commits that are red while their parent is green (or they are root).
 *
 * @param repo - Linear repo
 */
export function countFirstBads(repo: Repo): number {
  let count = 0;
  for (const sha of repo.order) {
    const commit = commitAt(repo, sha);
    if (runSuite(commit.tree).ok) {
      continue;
    }
    if (commit.parent === null) {
      count += 1;
      continue;
    }
    const parent = commitAt(repo, commit.parent);
    if (runSuite(parent.tree).ok) {
      count += 1;
    }
  }
  return count;
}

/**
 * Assert ancestors of firstBad are green and it plus descendants are red.
 *
 * @param repo - Linear repo
 * @param firstBad - Planted SHA
 */
export function assertPersistence(repo: Repo, firstBad: Sha): void {
  const pivot = indexOfSha(repo, firstBad);
  for (let i = 0; i < repo.order.length; i += 1) {
    const sha = requireSha(repo, i);
    const commit = commitAt(repo, sha);
    const ok = runSuite(commit.tree).ok;
    if (i < pivot && !ok) {
      throw new GameError("INVALID_RANGE", `ancestor ${sha} should be green`);
    }
    if (i >= pivot && ok) {
      throw new GameError("INVALID_RANGE", `descendant ${sha} should be red`);
    }
  }
}

/**
 * Mark what the suite said until one commit remains, then accuse.
 *
 * @param generated - Planted history
 */
export function optimalAccuse(generated: GeneratedHistory): Sha {
  let state = start(generated.repo, generated.knownGood, generated.knownBad);
  while (state.status === "searching") {
    const commit = commitAt(state.repo, state.current);
    const result = runSuite(commit.tree);
    state = mark(state, result.ok ? "good" : "bad");
  }
  state = accuse(state);
  if (state.accused === null) {
    throw new GameError("NOT_READY_TO_ACCUSE", "optimal walk did not accuse");
  }
  return state.accused;
}
