import { applyMutation, goodTree } from "./bugs";
import { GameError } from "./errors";
import { createLinearHistory, type LinearCommitSpec } from "./git";
import { mulberry32 } from "./prng";
import type { GeneratedHistory, GenerateInput } from "./types";

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
