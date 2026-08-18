import { GameError } from "./errors";
import { checkout, indexOfSha, shaAt } from "./git";
import { costOf } from "./score";
import type { BisectState, BisectStatus, Repo, Sha } from "./types";

/**
 * Midpoint index, or null when the range is a single commit.
 * Why floor((lo + hi) / 2): ordinary lower-bound split. For power-of-two n
 * the worst-case mark count is exactly ceil(log2(n)).
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
 * Start a search. Bounds are already marked and do not cost. Checks out midpoint.
 *
 * @param repo - Linear history
 * @param knownGood - Already-good ancestor
 * @param knownBad - Already-bad descendant (usually HEAD)
 */
export function start(repo: Repo, knownGood: Sha, knownBad: Sha): BisectState {
  if (repo.order.length < 2) {
    throw new GameError("EMPTY_REPO", "bisect needs a known-good and a known-bad");
  }
  const lo = indexOfSha(repo, knownGood);
  const hi = indexOfSha(repo, knownBad);
  if (lo >= hi) {
    throw new GameError(
      "INVALID_RANGE",
      "known-good must be a strict ancestor of known-bad on the linear order",
    );
  }
  const suspectCount = hi - lo;
  const mid = midpointIndex(lo, hi);
  const current = mid === null ? knownBad : shaAt(repo, mid);
  const status: BisectStatus = mid === null ? "readyToAccuse" : "searching";
  return {
    repo: checkout(repo, current),
    knownGood,
    knownBad,
    current,
    marks: 0,
    suspectCount,
    status,
    accused: null,
  };
}

/**
 * SHA the engine would check out next, or null if ready to accuse.
 *
 * @param state - Current search
 */
export function midpoint(state: BisectState): Sha | null {
  const lo = indexOfSha(state.repo, state.knownGood);
  const hi = indexOfSha(state.repo, state.knownBad);
  const mid = midpointIndex(lo, hi);
  if (mid === null) {
    return null;
  }
  return shaAt(state.repo, mid);
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
  const lo = indexOfSha(state.repo, state.knownGood);
  const hi = indexOfSha(state.repo, state.knownBad);
  const currentIndex = indexOfSha(state.repo, state.current);
  if (currentIndex <= lo || currentIndex >= hi) {
    throw new GameError("INVALID_MARK", "current is not strictly inside the open range");
  }
  const nextGood = verdict === "good" ? state.current : state.knownGood;
  const nextBad = verdict === "bad" ? state.current : state.knownBad;
  const nextLo = verdict === "good" ? currentIndex : lo;
  const nextHi = verdict === "bad" ? currentIndex : hi;
  const marks = state.marks + costOf(verdict);
  const mid = midpointIndex(nextLo, nextHi);
  if (mid === null) {
    const accusedCandidate = nextBad;
    return {
      repo: checkout(state.repo, accusedCandidate),
      knownGood: nextGood,
      knownBad: nextBad,
      current: accusedCandidate,
      marks,
      suspectCount: state.suspectCount,
      status: "readyToAccuse",
      accused: null,
    };
  }
  const nextCurrent = shaAt(state.repo, mid);
  return {
    repo: checkout(state.repo, nextCurrent),
    knownGood: nextGood,
    knownBad: nextBad,
    current: nextCurrent,
    marks,
    suspectCount: state.suspectCount,
    status: "searching",
    accused: null,
  };
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
  if (state.status !== "readyToAccuse") {
    throw new GameError("NOT_READY_TO_ACCUSE", "range is not a single commit");
  }
  return {
    repo: checkout(state.repo, state.knownBad),
    knownGood: state.knownGood,
    knownBad: state.knownBad,
    current: state.knownBad,
    marks: state.marks + costOf("accuse"),
    suspectCount: state.suspectCount,
    status: "accused",
    accused: state.knownBad,
  };
}
