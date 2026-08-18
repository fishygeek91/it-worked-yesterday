import { describe, expect, it } from "vitest";

import {
  applyMutation,
  brokenComparison,
  COLLECT_PATH,
  COMPARE_PATH,
  COMPARISON_CHECK,
  COMPUTE_PATH,
  FIXTURE_PATH,
  FIXTURE_VALUE_CHECK,
  FLAG_PATH,
  FLIPPED_BOOLEAN_CHECK,
  flippedBoolean,
  GameError,
  goodTree,
  invertedSortComparator,
  LOOP_BOUND_CHECK,
  MATCH_PATH,
  missingReturn,
  MISSING_RETURN_CHECK,
  type MutationId,
  offByOneLoopBound,
  regexMissingEscape,
  REGEX_ESCAPE_CHECK,
  runSuite,
  SLICE_FENCEPOST_CHECK,
  SLICE_PATH,
  sliceFencepost,
  SORT_COMPARATOR_CHECK,
  SORT_PATH,
  wrongFixtureValue,
} from "../src/core";

const SOURCE_PATHS = [
  COLLECT_PATH,
  FLAG_PATH,
  MATCH_PATH,
  FIXTURE_PATH,
  COMPARE_PATH,
  COMPUTE_PATH,
  SORT_PATH,
  SLICE_PATH,
] as const;

/**
 * Assert the mutation edited only `path`.
 *
 * @param good - Unmutated tree
 * @param bad - Mutated tree
 * @param path - The one path that must change
 */
function expectOnlyPathChanged(good: ReturnType<typeof goodTree>, bad: ReturnType<typeof goodTree>, path: string): void {
  expect(bad[path]).not.toBe(good[path]);
  for (const other of SOURCE_PATHS) {
    if (other !== path) {
      expect(bad[other]).toBe(good[other]);
    }
  }
}

describe("offByOneLoopBound", () => {
  it("turns a green tree red on the loop-bound check", () => {
    const good = goodTree("fixture");
    const bad = offByOneLoopBound(good);
    expect(runSuite(good)).toEqual({ ok: true, name: "suite" });
    expect(runSuite(bad)).toEqual({ ok: false, name: LOOP_BOUND_CHECK });
    expectOnlyPathChanged(good, bad, COLLECT_PATH);
  });

  it("throws when the site is missing", () => {
    expect(() => {
      offByOneLoopBound({ "meta/note.txt": "empty" });
    }).toThrow(GameError);
  });
});

describe("flippedBoolean", () => {
  it("turns a green tree red on the flipped-boolean check", () => {
    const good = goodTree("fixture");
    const bad = flippedBoolean(good);
    expect(runSuite(good)).toEqual({ ok: true, name: "suite" });
    expect(runSuite(bad)).toEqual({ ok: false, name: FLIPPED_BOOLEAN_CHECK });
    expectOnlyPathChanged(good, bad, FLAG_PATH);
  });

  it("throws when the site is missing", () => {
    expect(() => {
      flippedBoolean({ "meta/note.txt": "empty" });
    }).toThrow(GameError);
  });
});

describe("regexMissingEscape", () => {
  it("turns a green tree red on the regex-escape check", () => {
    const good = goodTree("fixture");
    const bad = regexMissingEscape(good);
    expect(runSuite(good)).toEqual({ ok: true, name: "suite" });
    expect(runSuite(bad)).toEqual({ ok: false, name: REGEX_ESCAPE_CHECK });
    expectOnlyPathChanged(good, bad, MATCH_PATH);
  });

  it("throws when the site is missing", () => {
    expect(() => {
      regexMissingEscape({ "meta/note.txt": "empty" });
    }).toThrow(GameError);
  });
});

describe("wrongFixtureValue", () => {
  it("turns a green tree red on the fixture-value check", () => {
    const good = goodTree("fixture");
    const bad = wrongFixtureValue(good);
    expect(runSuite(good)).toEqual({ ok: true, name: "suite" });
    expect(runSuite(bad)).toEqual({ ok: false, name: FIXTURE_VALUE_CHECK });
    expectOnlyPathChanged(good, bad, FIXTURE_PATH);
  });

  it("throws when the site is missing", () => {
    expect(() => {
      wrongFixtureValue({ "meta/note.txt": "empty" });
    }).toThrow(GameError);
  });
});

describe("brokenComparison", () => {
  it("turns a green tree red on the broken-comparison check", () => {
    const good = goodTree("fixture");
    const bad = brokenComparison(good);
    expect(runSuite(good)).toEqual({ ok: true, name: "suite" });
    expect(runSuite(bad)).toEqual({ ok: false, name: COMPARISON_CHECK });
    expectOnlyPathChanged(good, bad, COMPARE_PATH);
  });

  it("throws when the site is missing", () => {
    expect(() => {
      brokenComparison({ "meta/note.txt": "empty" });
    }).toThrow(GameError);
  });
});

describe("missingReturn", () => {
  it("turns a green tree red on the missing-return check", () => {
    const good = goodTree("fixture");
    const bad = missingReturn(good);
    expect(runSuite(good)).toEqual({ ok: true, name: "suite" });
    expect(runSuite(bad)).toEqual({ ok: false, name: MISSING_RETURN_CHECK });
    expectOnlyPathChanged(good, bad, COMPUTE_PATH);
  });

  it("throws when the site is missing", () => {
    expect(() => {
      missingReturn({ "meta/note.txt": "empty" });
    }).toThrow(GameError);
  });
});

describe("invertedSortComparator", () => {
  it("turns a green tree red on the sort-comparator check", () => {
    const good = goodTree("fixture");
    const bad = invertedSortComparator(good);
    expect(runSuite(good)).toEqual({ ok: true, name: "suite" });
    expect(runSuite(bad)).toEqual({ ok: false, name: SORT_COMPARATOR_CHECK });
    expectOnlyPathChanged(good, bad, SORT_PATH);
  });

  it("throws when the site is missing", () => {
    expect(() => {
      invertedSortComparator({ "meta/note.txt": "empty" });
    }).toThrow(GameError);
  });
});

describe("sliceFencepost", () => {
  it("turns a green tree red on the slice-fencepost check", () => {
    const good = goodTree("fixture");
    const bad = sliceFencepost(good);
    expect(runSuite(good)).toEqual({ ok: true, name: "suite" });
    expect(runSuite(bad)).toEqual({ ok: false, name: SLICE_FENCEPOST_CHECK });
    expectOnlyPathChanged(good, bad, SLICE_PATH);
  });

  it("throws when the site is missing", () => {
    expect(() => {
      sliceFencepost({ "meta/note.txt": "empty" });
    }).toThrow(GameError);
  });
});

describe("applyMutation", () => {
  const cases: { id: MutationId; check: string; path: string }[] = [
    { id: "offByOneLoopBound", check: LOOP_BOUND_CHECK, path: COLLECT_PATH },
    { id: "flippedBoolean", check: FLIPPED_BOOLEAN_CHECK, path: FLAG_PATH },
    { id: "regexMissingEscape", check: REGEX_ESCAPE_CHECK, path: MATCH_PATH },
    { id: "wrongFixtureValue", check: FIXTURE_VALUE_CHECK, path: FIXTURE_PATH },
    { id: "brokenComparison", check: COMPARISON_CHECK, path: COMPARE_PATH },
    { id: "missingReturn", check: MISSING_RETURN_CHECK, path: COMPUTE_PATH },
    { id: "invertedSortComparator", check: SORT_COMPARATOR_CHECK, path: SORT_PATH },
    { id: "sliceFencepost", check: SLICE_FENCEPOST_CHECK, path: SLICE_PATH },
  ];

  it("fails exactly one check per authored mutation", () => {
    const good = goodTree("fixture");
    expect(runSuite(good)).toEqual({ ok: true, name: "suite" });
    for (const row of cases) {
      const bad = applyMutation(good, row.id);
      expect(runSuite(bad), row.id).toEqual({ ok: false, name: row.check });
      expectOnlyPathChanged(good, bad, row.path);
    }
  });
});
