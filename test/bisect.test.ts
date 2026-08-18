import { describe, expect, it } from "vitest";

import {
  accuse,
  commitAt,
  costOf,
  GameError,
  generateBuggyHistory,
  generateDiamondHistory,
  indexOfSha,
  mark,
  midpoint,
  midpointIndex,
  optimalMarks,
  runSuite,
  start,
} from "../src/core";
import { optimalAccuse, requireSha } from "./helpers";

describe("midpoint math", () => {
  it("uses floor((lo + hi) / 2) and null when hi - lo === 1", () => {
    expect(midpointIndex(0, 8)).toBe(4);
    expect(midpointIndex(0, 4)).toBe(2);
    expect(midpointIndex(2, 4)).toBe(3);
    expect(midpointIndex(3, 4)).toBeNull();
    expect(midpointIndex(0, 1)).toBeNull();
    expect(midpointIndex(0, 2)).toBe(1);
  });

  it("rejects inverted bounds", () => {
    expect(() => {
      midpointIndex(4, 4);
    }).toThrow(GameError);
  });
});

describe("hand-checked 8-suspect walk", () => {
  it("accuses first-bad at suspect index 3 in 3 marks", () => {
    const generated = generateBuggyHistory({
      suspectCount: 8,
      firstBadIndex: 3,
      seed: 1729,
      mutation: "offByOneLoopBound",
    });
    const { repo } = generated;
    expect(indexOfSha(repo, generated.firstBad)).toBe(4);

    let state = start(repo, generated.knownGood, generated.knownBad);
    expect(state.current).toBe(requireSha(repo, 4));
    expect(runSuite(commitAt(state.repo, state.current).tree).ok).toBe(false);
    expect(midpoint(state)).toBe(requireSha(repo, 4));

    state = mark(state, "bad");
    expect(state.marks).toBe(costOf("bad"));
    expect(state.current).toBe(requireSha(repo, 2));
    expect(runSuite(commitAt(state.repo, state.current).tree).ok).toBe(true);

    state = mark(state, "good");
    expect(state.marks).toBe(costOf("bad") + costOf("good"));
    expect(state.current).toBe(requireSha(repo, 3));
    expect(runSuite(commitAt(state.repo, state.current).tree).ok).toBe(true);

    state = mark(state, "good");
    expect(state.status).toBe("readyToAccuse");
    expect(state.knownBad).toBe(generated.firstBad);
    expect(midpoint(state)).toBeNull();

    state = accuse(state);
    expect(state.accused).toBe(generated.firstBad);
    expect(state.marks).toBe(3);
    expect(state.marks).toBe(optimalMarks(8));
    expect(() => {
      accuse(state);
    }).toThrow(GameError);
  });
});

describe("DAG split", () => {
  it("matches floor((lo + hi) / 2) on a linear history", () => {
    const generated = generateBuggyHistory({
      suspectCount: 8,
      firstBadIndex: 3,
      seed: 1729,
      mutation: "offByOneLoopBound",
    });
    const state = start(generated.repo, generated.knownGood, generated.knownBad);
    const lo = indexOfSha(generated.repo, generated.knownGood);
    const hi = indexOfSha(generated.repo, generated.knownBad);
    const mid = midpointIndex(lo, hi);
    if (mid === null) {
      throw new Error("expected a linear midpoint");
    }
    expect(state.current).toBe(requireSha(generated.repo, mid));
    expect(state.suspects).toHaveLength(8);
  });

  it("accuses the planted first-bad on an honest diamond walk and loses when the player lies", () => {
    const generated = generateDiamondHistory({
      suspectCount: 8,
      seed: 1729,
      mutation: "missingReturn",
      firstBadLane: "branch",
      firstBadOnLane: 1,
    });
    expect(optimalAccuse(generated)).toBe(generated.firstBad);

    let state = start(generated.repo, generated.knownGood, generated.knownBad);
    while (state.status === "searching") {
      const ok = runSuite(commitAt(state.repo, state.current).tree).ok;
      state = mark(state, ok ? "bad" : "good");
    }
    state = accuse(state);
    expect(state.accused).not.toBe(generated.firstBad);
  });
});
