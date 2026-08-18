import { describe, expect, it } from "vitest";

import { commitAt } from "../src/core";
import { createSession, dispatch, TUTORIAL_INPUT, type GameSession } from "../src/harness";
import { renderChrome } from "../src/ui";

/**
 * Walk to the end marking against the suite every time. Always loses.
 */
function lostWalk(): GameSession {
  let session = createSession(TUTORIAL_INPUT);
  while (session.bisect.status === "searching") {
    session = dispatch(session, session.lastResult.ok ? "bad" : "good");
  }
  return dispatch(session, "accuse");
}

/**
 * Walk to the end marking what the suite said. Always wins.
 */
function wonWalk(): GameSession {
  let session = createSession(TUTORIAL_INPUT);
  while (session.bisect.status === "searching") {
    session = dispatch(session, session.lastResult.ok ? "good" : "bad");
  }
  return dispatch(session, "accuse");
}

describe("interview ledger", () => {
  it("starts empty", () => {
    expect(createSession(TUTORIAL_INPUT).ledger).toEqual([]);
  });

  it("records the room, the word, and the suite verdict per mark", () => {
    const start = createSession(TUTORIAL_INPUT);
    const roomSha = commitAt(start.bisect.repo, start.bisect.current).sha;
    const said = start.lastResult.ok ? "good" : "bad";
    const marked = dispatch(start, said);
    expect(marked.ledger).toEqual([
      { sha: roomSha, said, suiteOk: start.lastResult.ok },
    ]);
  });

  it("does not record blame or accuse", () => {
    const start = createSession(TUTORIAL_INPUT);
    expect(dispatch(start, "blame").ledger).toEqual([]);
    const done = wonWalk();
    const marksOnly = done.ledger.length;
    expect(marksOnly).toBeGreaterThan(0);
    expect(done.ledger.every((entry) => entry.said === "good" || entry.said === "bad")).toBe(
      true,
    );
  });

  it("clears on reset", () => {
    const start = createSession(TUTORIAL_INPUT);
    const marked = dispatch(start, start.lastResult.ok ? "good" : "bad");
    expect(marked.ledger.length).toBe(1);
    expect(dispatch(marked, "reset").ledger).toEqual([]);
  });

  it("keeps entries in mark order and a lost walk holds at least one lie", () => {
    const lost = lostWalk();
    expect(lost.outcome).toBe("lost");
    const lies = lost.ledger.filter((entry) => entry.suiteOk !== (entry.said === "good"));
    expect(lies.length).toBeGreaterThan(0);
  });
});

describe("interview record on the desk", () => {
  it("reads the record back only on a loss and flags the lies", () => {
    const lost = lostWalk();
    const html = renderChrome(lost, { tutorialDone: true });
    expect(html).toContain("The interview record.");
    expect(html).toContain("is-lie");
    expect(html).toContain("Read it back. Somewhere in here you argued with the suite.");
    const first = lost.ledger[0];
    if (first === undefined) {
      throw new Error("lost walk recorded no marks");
    }
    expect(html).toContain(first.sha.slice(0, 7));
  });

  it("stays out of the win desk and the live desk", () => {
    const won = wonWalk();
    expect(renderChrome(won, { tutorialDone: true })).not.toContain("The interview record.");
    const playing = dispatch(
      createSession(TUTORIAL_INPUT),
      createSession(TUTORIAL_INPUT).lastResult.ok ? "good" : "bad",
    );
    expect(renderChrome(playing, { tutorialDone: true })).not.toContain(
      "The interview record.",
    );
  });
});
