import { describe, expect, it } from "vitest";

import { costOf, indexOfSha, optimalMarks } from "../src/core";
import {
  dispatch,
  isYesterdayInput,
  markTutorialDone,
  sessionForVisit,
  TUTORIAL_INPUT,
  YESTERDAY_INPUT,
  type GameSession,
  type TutorialStore,
} from "../src/harness";
import { renderChrome } from "../src/ui";

const YESTERDAY = "?l=yesterday";
const YESTERDAY_WITH_EXTRAS = "?l=yesterday&n=32&seed=1";
const TUTORIAL = "?l=tutorial";

/**
 * In-memory store. Tests must not touch window.
 *
 * @param initial - Optional starting entries
 */
function memoryStore(initial: Record<string, string> = {}): TutorialStore {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    get: (key) => {
      const value = data.get(key);
      return value === undefined ? null : value;
    },
    set: (key, value) => {
      data.set(key, value);
    },
  };
}

/**
 * Store after the tutorial has been finished once.
 */
function doneStore(): TutorialStore {
  const store = memoryStore();
  markTutorialDone(store);
  return store;
}

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

describe("sessionForVisit yesterday", () => {
  it("forces the tutorial when unseen even if the URL asks for yesterday", () => {
    const session = sessionForVisit(YESTERDAY, memoryStore());
    expect(session.input).toEqual(TUTORIAL_INPUT);
    expect(isYesterdayInput(session.input)).toBe(false);
  });

  it("plants the pinned yesterday dungeon after the tutorial is done", () => {
    const session = sessionForVisit(YESTERDAY, doneStore());
    expect(session.input).toEqual(YESTERDAY_INPUT);
    expect(isYesterdayInput(session.input)).toBe(true);
    expect(session.input.firstBadIndex).toBe(14);
    expect(session.input.firstBadIndex).toBeGreaterThanOrEqual(
      (session.input.suspectCount * 3) / 4,
    );
    expect(session.input.mutation).toBe("flippedBoolean");
    expect(indexOfSha(session.generated.repo, session.generated.firstBad)).toBe(15);
  });

  it("uses yesterday as last free-play on an empty query after the tutorial", () => {
    const store = doneStore();
    expect(sessionForVisit("", store).input).toEqual(YESTERDAY_INPUT);
    expect(sessionForVisit("?", store).input).toEqual(YESTERDAY_INPUT);
    expect(sessionForVisit(TUTORIAL, store).input).toEqual(TUTORIAL_INPUT);
  });

  it("ignores extra n and seed on the pinned yesterday URL", () => {
    const session = sessionForVisit(YESTERDAY_WITH_EXTRAS, doneStore());
    expect(session.input).toEqual(YESTERDAY_INPUT);
  });
});

describe("yesterday clock", () => {
  it("uses the same costOf accounting as tutorial", () => {
    const started = sessionForVisit(YESTERDAY, doneStore());
    expect(optimalMarks(started.input.suspectCount)).toBe(4);
    const walked = markUntilReady(started, (current) => (current.lastResult.ok ? "good" : "bad"));
    const won = dispatch(walked.session, "accuse");
    const clock = walked.clock + costOf("accuse");
    expect(won.outcome).toBe("won");
    expect(won.marks).toBe(clock);
    expect(won.marks).toBe(optimalMarks(16));
    expect(costOf("accuse")).toBe(0);
    const reset = dispatch(won, "reset");
    expect(reset.marks).toBe(costOf("reset"));
    expect(costOf("reset")).toBe(0);
    expect(reset.input).toEqual(YESTERDAY_INPUT);
  });
});

describe("yesterday chrome", () => {
  it("does not show tutorial teach lines", () => {
    const html = renderChrome(sessionForVisit(YESTERDAY, doneStore()));
    expect(html).not.toContain("HEAD is red. The last green is 8 suspects back.");
    expect(html).toContain("HEAD is red. It worked sixteen suspects back.");
    expect(html.toLowerCase()).not.toMatch(/goblin|attack|xp/);
  });
});
