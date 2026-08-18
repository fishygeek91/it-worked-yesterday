import { describe, expect, it } from "vitest";

import { commitAt, GameError, indexOfSha, runSuite } from "../src/core";
import { parseUrl, serializeUrl, sessionFromUrl } from "../src/harness";

const SEEDED = "?l=seeded&n=32&seed=1729&marks=5";

/**
 * Assert `parseUrl` throws `INVALID_URL`.
 *
 * @param search - Query that must fail
 */
function expectInvalidUrl(search: string): void {
  try {
    parseUrl(search);
    expect.fail(`expected INVALID_URL for ${search}`);
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    if (error instanceof GameError) {
      expect(error.code).toBe("INVALID_URL");
    }
  }
}

describe("parseUrl / serializeUrl", () => {
  it("round-trips the seeded share example", () => {
    const state = parseUrl(SEEDED);
    expect(state).toEqual({ level: "seeded", n: 32, seed: 1729, marks: 5 });
    expect(serializeUrl(state)).toBe(SEEDED);
  });

  it("defaults an empty query to tutorial with a zero clock", () => {
    expect(parseUrl("")).toEqual({ level: "tutorial", marks: 0 });
    expect(parseUrl("?")).toEqual({ level: "tutorial", marks: 0 });
  });

  it("rejects invalid params without coercing", () => {
    expectInvalidUrl("?l=seeded&n=31&seed=1729&marks=5");
    expectInvalidUrl("?l=seeded&n=32.0&seed=1729&marks=5");
    expectInvalidUrl("?l=seeded&n=32&marks=5");
    expectInvalidUrl("?l=seeded&n=32&seed=-1&marks=5");
    expectInvalidUrl("?l=seeded&n=32&seed=4294967296&marks=5");
    expectInvalidUrl("?l=seeded&n=32&seed=1729&marks=-1");
    expectInvalidUrl("?l=Tutorial&n=32&seed=1729&marks=5");
    expectInvalidUrl("?l=seeded&n=32&seed=1729&marks=5&foo=1");
    expectInvalidUrl("?marks=5");
  });
});

describe("sessionFromUrl", () => {
  it("rebuilds the same dungeon from the same seeded URL", () => {
    const a = sessionFromUrl(SEEDED);
    const b = sessionFromUrl(SEEDED);
    expect(a.generated.firstBad).toBe(b.generated.firstBad);
    expect(a.generated.repo.order).toEqual(b.generated.repo.order);
    for (const sha of a.generated.repo.order) {
      const treeA = commitAt(a.generated.repo, sha).tree;
      const treeB = commitAt(b.generated.repo, sha).tree;
      expect(treeA).toEqual(treeB);
      expect(runSuite(treeA)).toEqual(runSuite(treeB));
    }
  });

  it("overlays marks without replaying the range", () => {
    const session = sessionFromUrl(SEEDED);
    expect(session.marks).toBe(5);
    expect(session.bisect.status).toBe("searching");
    expect(session.bisect.marks).toBe(0);
    expect(session.outcome).toBe("playing");
  });

  it("ignores n and seed on the pinned tutorial", () => {
    const session = sessionFromUrl("?l=tutorial&n=32&seed=99");
    expect(session.input.suspectCount).toBe(8);
    expect(session.input.firstBadIndex).toBe(3);
    expect(session.input.seed).toBe(1729);
    expect(session.input.mutation).toBe("offByOneLoopBound");
    expect(indexOfSha(session.generated.repo, session.generated.firstBad)).toBe(4);
    expect(session.marks).toBe(0);
  });
});
