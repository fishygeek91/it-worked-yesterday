import { describe, expect, it } from "vitest";

import { costOf, GameError, optimalMarks, type GenerateInput } from "../src/core";
import { createSession, dispatch, type GameSession } from "../src/harness";

const TUTORIAL: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

/**
 * Mark until the range is a single commit. The test chooses the verdict.
 *
 * @param session - Starting session
 * @param choose - How the player marks the current room
 */
function markUntilReady(
  session: GameSession,
  choose: (current: GameSession) => "good" | "bad",
): { session: GameSession; clock: number } {
  let next = session;
  let clock = session.marks;
  while (next.bisect.status === "searching") {
    const command = choose(next);
    next = dispatch(next, command);
    clock += costOf(command);
  }
  return { session: next, clock };
}

describe("createSession", () => {
  it("starts a tutorial-sized search with a zero clock", () => {
    const session = createSession(TUTORIAL);
    expect(session.marks).toBe(0);
    expect(session.outcome).toBe("playing");
    expect(session.bisect.status).toBe("searching");
    expect(session.generated.firstBad).toBe(session.generated.repo.order[4]);
  });
});

describe("dispatch", () => {
  it("wins a tutorial-sized session when the player marks what the suite said", () => {
    const started = createSession(TUTORIAL);
    const walked = markUntilReady(started, (current) => (current.lastResult.ok ? "good" : "bad"));
    const won = dispatch(walked.session, "accuse");
    const clock = walked.clock + costOf("accuse");
    expect(won.outcome).toBe("won");
    expect(won.bisect.accused).toBe(started.generated.firstBad);
    expect(won.marks).toBe(clock);
    expect(won.marks).toBe(optimalMarks(8));
  });

  it("loses when the player marks against the suite", () => {
    const started = createSession(TUTORIAL);
    const walked = markUntilReady(started, (current) => (current.lastResult.ok ? "bad" : "good"));
    const lost = dispatch(walked.session, "accuse");
    expect(lost.outcome).toBe("lost");
    expect(lost.bisect.accused).not.toBe(started.generated.firstBad);
  });

  it("throws when accuse happens before the range is a single commit", () => {
    const session = createSession(TUTORIAL);
    expect(session.bisect.status).toBe("searching");
    try {
      dispatch(session, "accuse");
      expect.fail("accuse should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(GameError);
      if (error instanceof GameError) {
        expect(error.code).toBe("NOT_READY_TO_ACCUSE");
      }
    }
  });

  it("rebuilds the same seed and zeros the clock on reset", () => {
    const started = createSession(TUTORIAL);
    const firstMark = started.lastResult.ok ? "good" : "bad";
    const marked = dispatch(started, firstMark);
    expect(marked.marks).toBe(costOf(firstMark));
    const resetAfterMark = dispatch(marked, "reset");
    expect(resetAfterMark.marks).toBe(costOf("reset"));
    expect(resetAfterMark.generated.firstBad).toBe(started.generated.firstBad);
    expect(resetAfterMark.generated.repo.order).toEqual(started.generated.repo.order);
    expect(resetAfterMark.outcome).toBe("playing");

    const walked = markUntilReady(resetAfterMark, (current) => (current.lastResult.ok ? "good" : "bad"));
    const won = dispatch(walked.session, "accuse");
    const resetAfterWin = dispatch(won, "reset");
    expect(resetAfterWin.marks).toBe(costOf("reset"));
    expect(resetAfterWin.generated.firstBad).toBe(started.generated.firstBad);
    expect(resetAfterWin.generated.repo.order).toEqual(started.generated.repo.order);
    expect(resetAfterWin.outcome).toBe("playing");
  });

  it("rejects unknown and reserved commands", () => {
    const session = createSession(TUTORIAL);
    for (const command of ["blame", "checkout", "attack"]) {
      try {
        dispatch(session, command);
        expect.fail(`${command} should throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(GameError);
        if (error instanceof GameError) {
          expect(error.code).toBe("INVALID_COMMAND");
        }
      }
    }
  });
});
