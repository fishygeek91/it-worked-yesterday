import { applyMutation, goodTree } from "./bugs";
import { GameError } from "./errors";
import { createHistory, createLinearHistory, type HistoryCommitSpec, type LinearCommitSpec } from "./git";
import { mulberry32 } from "./prng";
import type {
  DiamondGenerateInput,
  DiamondLayout,
  GeneratedHistory,
  GenerateInput,
} from "./types";

/**
 * Build a good linear history, then apply exactly one mutation at firstBad.
 * Why descendants keep the mutated file: a later green would invent a second
 * first-bad and make bisect a lie.
 *
 * @param input - Suspect count, first-bad index among suspects, seed, mutation
 */
export function generateBuggyHistory(input: GenerateInput): GeneratedHistory {
  const { suspectCount, firstBadIndex, seed, mutation } = input;
  if (!Number.isInteger(suspectCount) || suspectCount < 2) {
    throw new GameError(
      "INVALID_INDEX",
      `suspectCount must be an integer >= 2, got ${String(suspectCount)}`,
    );
  }
  if (!Number.isInteger(firstBadIndex) || firstBadIndex < 0 || firstBadIndex >= suspectCount) {
    throw new GameError(
      "INVALID_INDEX",
      `firstBadIndex must be in [0, ${String(suspectCount - 1)}], got ${String(firstBadIndex)}`,
    );
  }
  const rng = mulberry32(seed);
  const specs: LinearCommitSpec[] = [];
  specs.push({
    message: "it worked here",
    tree: goodTree(`root salt ${String(rng.nextInt(0x7fffffff))}`),
  });

  for (let suspect = 0; suspect < suspectCount; suspect += 1) {
    const orderIndex = suspect + 1;
    const salt = rng.nextInt(0x7fffffff);
    let tree = goodTree(`commit ${String(orderIndex)} salt ${String(salt)}`);
    if (suspect >= firstBadIndex) {
      tree = applyMutation(tree, mutation);
    }
    const message =
      suspect === firstBadIndex ? "adjust the walk bound" : `snapshot ${String(orderIndex)}`;
    specs.push({ message, tree });
  }

  const repo = createLinearHistory(specs);
  const knownGood = repo.order[0];
  const knownBad = repo.order[repo.order.length - 1];
  const firstBad = repo.order[firstBadIndex + 1];
  if (knownGood === undefined || knownBad === undefined || firstBad === undefined) {
    throw new GameError("EMPTY_REPO", "generator failed to pin bounds");
  }
  return { repo, firstBad, knownGood, knownBad };
}

/**
 * Measure the one diamond for `n` suspects: two lanes, one merge, HEAD
 * after the join. Why ceil/floor: keep both lanes at least length 1
 * whenever n >= 4, and give the extra commit to the trunk.
 *
 * @param suspectCount - Suspects, including both lanes, the merge, and HEAD
 */
export function diamondLayout(suspectCount: number): DiamondLayout {
  if (!Number.isInteger(suspectCount) || suspectCount < 4) {
    throw new GameError(
      "INVALID_INDEX",
      `diamond suspectCount must be an integer >= 4, got ${String(suspectCount)}`,
    );
  }
  const laneTotal = suspectCount - 2;
  const trunkLength = Math.ceil(laneTotal / 2);
  const branchLength = Math.floor(laneTotal / 2);
  const trunkIndices: number[] = [];
  for (let i = 0; i < trunkLength; i += 1) {
    trunkIndices.push(1 + i);
  }
  const branchIndices: number[] = [];
  for (let i = 0; i < branchLength; i += 1) {
    branchIndices.push(1 + trunkLength + i);
  }
  const mergeIndex = 1 + trunkLength + branchLength;
  const tailIndex = mergeIndex + 1;
  return {
    trunkLength,
    branchLength,
    trunkIndices,
    branchIndices,
    mergeIndex,
    tailIndex,
  };
}

/**
 * Indices that can reach `start` by walking planned parent indices.
 * Inclusive. Used so trees are painted before SHAs exist.
 *
 * @param parentLists - parentIndices per order index
 * @param start - First-bad order index
 */
function plannedDescendants(parentLists: readonly (readonly number[])[], start: number): Set<number> {
  const children = new Map<number, number[]>();
  for (let i = 0; i < parentLists.length; i += 1) {
    const parents = parentLists[i];
    if (parents === undefined) {
      throw new GameError("INVALID_INDEX", `missing parent list at ${String(i)}`);
    }
    for (const parent of parents) {
      const list = children.get(parent);
      if (list === undefined) {
        children.set(parent, [i]);
      } else {
        list.push(i);
      }
    }
  }
  const found = new Set<number>();
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || found.has(current)) {
      continue;
    }
    found.add(current);
    const next = children.get(current);
    if (next !== undefined) {
      for (const child of next) {
        stack.push(child);
      }
    }
  }
  return found;
}

/**
 * Build one diamond: fork after the known-good, join before HEAD, first-bad
 * on one lane. Failure persists in DAG descendants so the other lane stays
 * green and the merge goes red.
 *
 * @param input - n, seed, mutation, lane pin
 */
export function generateDiamondHistory(input: DiamondGenerateInput): GeneratedHistory {
  const { suspectCount, seed, mutation, firstBadLane, firstBadOnLane } = input;
  const layout = diamondLayout(suspectCount);
  const laneIndices = firstBadLane === "trunk" ? layout.trunkIndices : layout.branchIndices;
  if (!Number.isInteger(firstBadOnLane) || firstBadOnLane < 0 || firstBadOnLane >= laneIndices.length) {
    throw new GameError(
      "INVALID_INDEX",
      `firstBadOnLane must be in [0, ${String(laneIndices.length - 1)}], got ${String(firstBadOnLane)}`,
    );
  }
  const firstBadOrder = laneIndices[firstBadOnLane];
  if (firstBadOrder === undefined) {
    throw new GameError("INVALID_INDEX", "diamond failed to pin first-bad");
  }

  const lastTrunk = layout.trunkIndices[layout.trunkIndices.length - 1];
  const lastBranch = layout.branchIndices[layout.branchIndices.length - 1];
  if (lastTrunk === undefined || lastBranch === undefined) {
    throw new GameError("EMPTY_REPO", "diamond lanes are empty");
  }

  const parentLists: number[][] = [[]];
  for (let i = 0; i < layout.trunkLength; i += 1) {
    parentLists.push([i === 0 ? 0 : 1 + (i - 1)]);
  }
  for (let i = 0; i < layout.branchLength; i += 1) {
    parentLists.push([i === 0 ? 0 : 1 + layout.trunkLength + (i - 1)]);
  }
  parentLists.push([lastTrunk, lastBranch]);
  parentLists.push([layout.mergeIndex]);

  const red = plannedDescendants(parentLists, firstBadOrder);
  const rng = mulberry32(seed);
  const specs: HistoryCommitSpec[] = [];
  for (let i = 0; i < parentLists.length; i += 1) {
    const parents = parentLists[i];
    if (parents === undefined) {
      throw new GameError("INVALID_INDEX", `missing diamond parents at ${String(i)}`);
    }
    const salt = rng.nextInt(0x7fffffff);
    let tree = goodTree(`commit ${String(i)} salt ${String(salt)}`);
    if (red.has(i)) {
      tree = applyMutation(tree, mutation);
    }
    const message =
      i === 0 ? "it worked here" : i === firstBadOrder ? "adjust the walk bound" : `snapshot ${String(i)}`;
    specs.push({ message, tree, parentIndices: parents });
  }

  const repo = createHistory(specs);
  const knownGood = repo.order[0];
  const knownBad = repo.order[layout.tailIndex];
  const firstBad = repo.order[firstBadOrder];
  if (knownGood === undefined || knownBad === undefined || firstBad === undefined) {
    throw new GameError("EMPTY_REPO", "diamond generator failed to pin bounds");
  }
  return { repo, firstBad, knownGood, knownBad };
}
