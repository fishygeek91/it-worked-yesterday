import { describe, expect, it } from "vitest";

import { commitAt, costOf, GameError, indexOfSha, runSuite } from "../src/core";
import {
  createSession,
  dispatch,
  parseUrl,
  serializeUrl,
  sessionFromUrl,
  shareUrl,
  type GameSession,
} from "../src/harness";

const SEEDED = "?l=seeded&n=32&seed=1729&marks=5";

/**
 * Assert a URL parse or replay throws `INVALID_URL`.
 *
 * @param search - Query that must fail
 * @param load - `parse` checks the query only; `session` also replays `t`
 */
function expectInvalidUrl(search: string, load: "parse" | "session" = "parse"): void {
  try {
    if (load === "session") {
      sessionFromUrl(search);
    } else {
      parseUrl(search);
    }
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

  it("parses learn as a case file with no clock", () => {
    expect(parseUrl("?l=learn")).toEqual({ level: "learn" });
    expect(serializeUrl({ level: "learn" })).toBe("?l=learn");
    expectInvalidUrl("?l=Learn");
  });
});

describe("sessionFromUrl learn", () => {
  it("refuses to plant a dungeon for the case file", () => {
    try {
      sessionFromUrl("?l=learn");
      expect.fail("learn must not become a dungeon");
    } catch (error) {
      expect(error).toBeInstanceOf(GameError);
      if (error instanceof GameError) {
        expect(error.code).toBe("INVALID_URL");
      }
    }
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

/**
 * Dispatch letters live. The test chooses the commands; the engine does not.
 *
 * @param session - Starting session
 * @param commands - Session commands to apply
 */
function play(session: GameSession, commands: readonly ("good" | "bad" | "blame")[]): GameSession {
  return commands.reduce((current, command) => dispatch(current, command), session);
}

describe("transcript resume", () => {
  it("replays t=gbg to the same range, checkout, clock, and ledger as live play", () => {
    const fresh = sessionFromUrl("?l=seeded&n=32&seed=1729");
    const live = play(fresh, ["good", "bad", "good"]);
    const restored = sessionFromUrl("?l=seeded&n=32&seed=1729&t=gbg");
    expect(restored.bisect.knownGood).toBe(live.bisect.knownGood);
    expect(restored.bisect.knownBad).toBe(live.bisect.knownBad);
    expect(restored.bisect.current).toBe(live.bisect.current);
    expect(restored.bisect.status).toBe(live.bisect.status);
    expect(restored.marks).toBe(live.marks);
    expect(restored.ledger).toEqual(live.ledger);
    expect(restored.transcript).toBe("gbg");
    expect(restored.lastResult).toEqual(live.lastResult);
  });

  it("rejects t together with marks, unknown letters, and illegal marks", () => {
    expectInvalidUrl("?l=seeded&n=32&seed=1729&t=gbg&marks=5");
    expectInvalidUrl("?l=seeded&n=32&seed=1729&t=G");
    expectInvalidUrl("?l=seeded&n=32&seed=1729&t=x");
    expectInvalidUrl("?l=seeded&n=32&seed=1729&t=a");
    expectInvalidUrl("?l=seeded&n=32&seed=1729&t=");
    expectInvalidUrl("?l=tutorial&t=bggg", "session");
  });

  it("charges replay through costOf and is deterministic", () => {
    const search = "?l=tutorial&t=lbgg";
    const a = sessionFromUrl(search);
    const b = sessionFromUrl(search);
    expect(a.marks).toBe(costOf("blame") + costOf("bad") + costOf("good") + costOf("good"));
    expect(a.marks).toBe(b.marks);
    expect(a.bisect.current).toBe(b.bisect.current);
    expect(a.ledger).toEqual(b.ledger);
    expect(a.generated.firstBad).toBe(b.generated.firstBad);
    expect(a.transcript).toBe("lbgg");
  });

  it("emits t mid-search and marks after accuse; old marks links still overlay", () => {
    const overlay = sessionFromUrl(SEEDED);
    expect(overlay.marks).toBe(5);
    expect(overlay.bisect.marks).toBe(0);
    expect(overlay.transcript).toBe("");
    expect(shareUrl(overlay)).toBe(SEEDED);

    const searching = play(createSession(overlay.input), ["good", "bad", "good"]);
    expect(shareUrl(searching)).toBe("?l=seeded&n=32&seed=1729&t=gbg");

    let finished = searching;
    while (finished.bisect.status === "searching") {
      finished = dispatch(finished, finished.lastResult.ok ? "good" : "bad");
    }
    finished = dispatch(finished, "accuse");
    expect(finished.outcome === "won" || finished.outcome === "lost").toBe(true);
    expect(shareUrl(finished)).toBe(`?l=seeded&n=32&seed=1729&marks=${String(finished.marks)}`);
    expect(shareUrl(finished)).not.toContain("t=");
  });
});
