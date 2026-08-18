import { describe, expect, it } from "vitest";

import { costOf, GameError, midpoint, shaAt, type GenerateInput } from "../src/core";
import {
  createSession,
  dispatch,
  sessionFromUrl,
  shareUrl,
  type GameSession,
} from "../src/harness";
import { renderChrome } from "../src/ui";

const TUTORIAL: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

/**
 * Expect a `GameError` with the given code from `run`.
 *
 * @param run - Failing call
 * @param code - Expected machine code
 */
function expectGameError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    if (error instanceof GameError) {
      expect(error.code).toBe(code);
    }
    return;
  }
  throw new Error(`expected GameError ${code}`);
}

/**
 * Mark what the suite said until one SHA remains, then accuse.
 *
 * @param session - Starting session
 */
function honestWin(session: GameSession): GameSession {
  let next = session;
  while (next.bisect.status === "searching") {
    next = dispatch(next, next.lastResult.ok ? "good" : "bad");
  }
  return dispatch(next, "accuse");
}

describe("checkout <sha>", () => {
  it("walks the lantern at the reserved cost and buys no evidence", () => {
    const session = createSession(TUTORIAL);
    const target = shaAt(session.bisect.repo, 1);
    expect(target).not.toBe(session.bisect.current);
    const walked = dispatch(session, `checkout ${target}`);
    expect(walked.bisect.current).toBe(target);
    expect(walked.marks).toBe(costOf("checkout"));
    expect(walked.bisect.suspects).toEqual(session.bisect.suspects);
    expect(walked.bisect.knownGood).toBe(session.bisect.knownGood);
    expect(walked.bisect.knownBad).toBe(session.bisect.knownBad);
    expect(walked.bisect.status).toBe(session.bisect.status);
    expect(walked.ledger).toEqual([]);
    expect(walked.transcript).toBe("");
  });

  it("reads the suite at the new room", () => {
    const session = createSession(TUTORIAL);
    const atKnownGood = dispatch(
      session,
      `checkout ${session.generated.knownGood}`,
    );
    expect(atKnownGood.lastResult.ok).toBe(true);
    const atKnownBad = dispatch(
      session,
      `checkout ${session.generated.knownBad}`,
    );
    expect(atKnownBad.lastResult.ok).toBe(false);
  });

  it("throws on unknown SHAs and malformed operands", () => {
    const session = createSession(TUTORIAL);
    expectGameError(() => dispatch(session, "checkout 0000000"), "INVALID_SHA");
    expectGameError(() => dispatch(session, "checkout"), "INVALID_COMMAND");
    expectGameError(() => dispatch(session, "checkout a b"), "INVALID_COMMAND");
  });

  it("is a paid look: marks stay legal only at the engine's checkout", () => {
    const session = createSession(TUTORIAL);
    const suspect = session.bisect.suspects.find(
      (sha) => sha !== session.bisect.current,
    );
    if (suspect === undefined) {
      throw new Error("no other suspect to walk to");
    }
    const offSplit = dispatch(session, `checkout ${suspect}`);
    expectGameError(() => dispatch(offSplit, "good"), "INVALID_MARK");
    const offHtml = renderChrome(offSplit);
    expect(offHtml).toContain("The interview is at another room.");
    expect(offHtml).toMatch(/data-command="good" data-cost="[^"]+" disabled>/);
    const split = midpoint(offSplit.bisect);
    if (split === null) {
      throw new Error("searching walk has no midpoint");
    }
    const walkedBack = dispatch(offSplit, `checkout ${split}`);
    const marked = dispatch(walkedBack, walkedBack.lastResult.ok ? "good" : "bad");
    const lastLine = marked.ledger[marked.ledger.length - 1];
    expect(lastLine?.sha).toBe(split);
    expect(marked.marks).toBe(costOf("checkout") * 2 + costOf("good"));
  });

  it("refuses marks outside the remaining range", () => {
    const session = createSession(TUTORIAL);
    const outside = dispatch(session, `checkout ${session.generated.knownGood}`);
    expectGameError(() => dispatch(outside, "good"), "INVALID_MARK");
    expectGameError(() => dispatch(outside, "bad"), "INVALID_MARK");
    const html = renderChrome(outside);
    expect(html).toContain("This room is outside the remaining range.");
    expect(html).toMatch(/data-command="good" data-cost="[^"]+" disabled>/);
    expect(html).toMatch(/data-command="bad" data-cost="[^"]+" disabled>/);
    expect(renderChrome(session)).not.toContain(
      "This room is outside the remaining range.",
    );
  });

  it("is ignored after the game is over, like other non-reset commands", () => {
    const won = honestWin(createSession(TUTORIAL));
    expect(won.outcome).toBe("won");
    const after = dispatch(won, `checkout ${won.generated.knownGood}`);
    expect(after).toBe(won);
  });

  it("stays out of the transcript; penalty marks do not travel", () => {
    const session = createSession(TUTORIAL);
    const walked = dispatch(
      dispatch(session, "good"),
      `checkout ${session.generated.knownGood}`,
    );
    const split = midpoint(walked.bisect);
    if (split === null) {
      throw new Error("searching walk has no midpoint");
    }
    const evidence = dispatch(dispatch(walked, `checkout ${split}`), "bad");
    expect(evidence.transcript).toBe("gb");
    expect(evidence.marks).toBe(
      costOf("good") + costOf("bad") + costOf("checkout") * 2,
    );
    const query = shareUrl(evidence);
    expect(query).toBe("?l=tutorial&t=gb");
    const replayed = sessionFromUrl(query);
    expect(replayed.marks).toBe(costOf("good") + costOf("bad"));
    expect(replayed.bisect.suspects).toEqual(evidence.bisect.suspects);
    expect(replayed.bisect.current).toBe(evidence.bisect.current);
    expect(replayed.ledger).toEqual(evidence.ledger);
  });
});
