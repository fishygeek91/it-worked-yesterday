import { GameError } from "./errors";
import { ancestors, checkout, indexOfSha } from "./git";
import { costOf } from "./score";
import type { BisectState, Repo, Sha } from "./types";

/**
 * Midpoint index, or null when the range is a single commit.
 * Why floor((lo + hi) / 2): ordinary lower-bound split. For power-of-two n
 * the worst-case mark count is exactly ceil(log2(n)). The DAG split
 * reduces to this on a linear history.
 *
 * @param lo - Index of newest known-good
 * @param hi - Index of oldest known-bad
 */
export function midpointIndex(lo: number, hi: number): number | null {
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi < 0) {
    throw new GameError("INVALID_INDEX", `bad bisect bounds ${String(lo)} ${String(hi)}`);
  }
  if (hi <= lo) {
    throw new GameError("INVALID_RANGE", "known-bad must be after known-good");
  }
  if (hi - lo === 1) {
    return null;
  }
  return Math.floor((lo + hi) / 2);
}

/**
 * Suspect set S: ancestors of `knownBad` minus ancestors of every known-good.
 * Inclusive on both sides, then the goods drop out. Order follows `repo.order`.
 *
 * @param repo - Current repo
 * @param knownGoods - Already-good commits
 * @param knownBad - Already-bad descendant
 */
export function suspectSet(repo: Repo, knownGoods: readonly Sha[], knownBad: Sha): Sha[] {
  const forbidden = new Set<Sha>();
  for (const good of knownGoods) {
    for (const ancestor of ancestors(repo, good)) {
      forbidden.add(ancestor);
    }
  }
  return ancestors(repo, knownBad).filter((sha) => !forbidden.has(sha));
}

/**
 * Max-min split of S. w(c) = |ancestors(c) ∩ S| inclusive. Check out the
 * c that maximizes min(w, |S| - w). Tie-break: lowest `repo.order` index.
 * Why this rule: on a line it is floor((lo + hi) / 2), so v1 walks stay
 * byte-identical.
 *
 * @param repo - Current repo
 * @param suspects - Remaining S
 */
export function splitSuspect(repo: Repo, suspects: readonly Sha[]): Sha | null {
  if (suspects.length <= 1) {
    return null;
  }
  const inS = new Set(suspects);
  let best: Sha | null = null;
  let bestScore = -1;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const candidate of suspects) {
    let weight = 0;
    for (const ancestor of ancestors(repo, candidate)) {
      if (inS.has(ancestor)) {
        weight += 1;
      }
    }
    const score = Math.min(weight, suspects.length - weight);
    const index = indexOfSha(repo, candidate);
    if (score > bestScore || (score === bestScore && index < bestIndex)) {
      best = candidate;
      bestScore = score;
      bestIndex = index;
    }
  }
  return best;
}

/**
 * Build the next state after S changes. Ready when one SHA remains.
 *
 * @param repo - Current repo
 * @param knownGood - Newest recorded good
 * @param knownBad - Oldest recorded bad
 * @param suspects - Updated S
 * @param marks - Clock so far
 * @param suspectCount - Initial |S|
 */
function nextState(
  repo: Repo,
  knownGood: Sha,
  knownBad: Sha,
  suspects: readonly Sha[],
  marks: number,
  suspectCount: number,
): BisectState {
  if (suspects.length === 0) {
    throw new GameError("INVALID_RANGE", "suspect set is empty");
  }
  if (suspects.length === 1) {
    const remaining = suspects[0];
    if (remaining === undefined) {
      throw new GameError("INVALID_RANGE", "suspect set is empty");
    }
    return {
      repo: checkout(repo, remaining),
      knownGood,
      knownBad,
      current: remaining,
      marks,
      suspectCount,
      suspects: [...suspects],
      status: "readyToAccuse",
      accused: null,
    };
  }
  const current = splitSuspect(repo, suspects);
  if (current === null) {
    throw new GameError("INVALID_RANGE", "searching walk has no midpoint");
  }
  return {
    repo: checkout(repo, current),
    knownGood,
    knownBad,
    current,
    marks,
    suspectCount,
    suspects: [...suspects],
    status: "searching",
    accused: null,
  };
}

/**
 * Start a search. Bounds are already marked and do not cost. Checks out midpoint.
 *
 * @param repo - History
 * @param knownGood - Already-good ancestor
 * @param knownBad - Already-bad descendant (usually HEAD)
 */
export function start(repo: Repo, knownGood: Sha, knownBad: Sha): BisectState {
  if (repo.order.length < 2) {
    throw new GameError("EMPTY_REPO", "bisect needs a known-good and a known-bad");
  }
  const suspects = suspectSet(repo, [knownGood], knownBad);
  if (suspects.length === 0) {
    throw new GameError(
      "INVALID_RANGE",
      "known-good must be an ancestor of known-bad",
    );
  }
  return nextState(repo, knownGood, knownBad, suspects, 0, suspects.length);
}

/**
 * SHA the engine would check out next, or null if ready to accuse.
 *
 * @param state - Current search
 */
export function midpoint(state: BisectState): Sha | null {
  return splitSuspect(state.repo, state.suspects);
}

/**
 * Apply `git bisect good` or `git bisect bad` to the current room.
 *
 * @param state - Current search
 * @param verdict - Player mark
 */
export function mark(state: BisectState, verdict: "good" | "bad"): BisectState {
  if (state.status === "accused") {
    throw new GameError("ALREADY_ACCUSED", "search is over");
  }
  if (state.status !== "searching") {
    throw new GameError("INVALID_MARK", "range is a single commit; accuse it");
  }
  if (!state.suspects.includes(state.current)) {
    throw new GameError("INVALID_MARK", "current is not in the suspect set");
  }
  const related = new Set(ancestors(state.repo, state.current));
  const suspects =
    verdict === "good"
      ? state.suspects.filter((sha) => !related.has(sha))
      : state.suspects.filter((sha) => related.has(sha));
  const nextGood = verdict === "good" ? state.current : state.knownGood;
  const nextBad = verdict === "bad" ? state.current : state.knownBad;
  const marks = state.marks + costOf(verdict);
  return nextState(state.repo, nextGood, nextBad, suspects, marks, state.suspectCount);
}

/**
 * Name the remaining SHA. Only legal when the range is a single commit.
 *
 * @param state - Ready-to-accuse search
 */
export function accuse(state: BisectState): BisectState {
  if (state.status === "accused") {
    throw new GameError("ALREADY_ACCUSED", "already accused");
  }
  if (state.status !== "readyToAccuse" || state.suspects.length !== 1) {
    throw new GameError("NOT_READY_TO_ACCUSE", "range is not a single commit");
  }
  const remaining = state.suspects[0];
  if (remaining === undefined) {
    throw new GameError("NOT_READY_TO_ACCUSE", "range is not a single commit");
  }
  return {
    repo: checkout(state.repo, remaining),
    knownGood: state.knownGood,
    knownBad: state.knownBad,
    current: remaining,
    marks: state.marks + costOf("accuse"),
    suspectCount: state.suspectCount,
    suspects: [remaining],
    status: "accused",
    accused: remaining,
  };
}
