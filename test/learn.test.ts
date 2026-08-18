import { describe, expect, it } from "vitest";

import { GameError, optimalMarks } from "../src/core";
import {
  markTutorialDone,
  parseUrl,
  TUTORIAL_INPUT,
  visitForSearch,
  type GameSession,
  type TutorialStore,
} from "../src/harness";
import {
  learnExhibits,
  learnWalkNext,
  learnWalkStart,
  renderBadUrl,
  renderChrome,
  renderLearn,
} from "../src/ui";

const LEARN = "?l=learn";

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
 * Step the honest walk until it ends. Bounded so a bug cannot spin.
 *
 * @param walk - Starting walk
 */
function walkToEnd(walk: GameSession): GameSession {
  let next = walk;
  for (let step = 0; step < 16; step += 1) {
    if (next.outcome !== "playing") {
      return next;
    }
    next = learnWalkNext(next);
  }
  return next;
}

describe("visitForSearch learn", () => {
  it("routes ?l=learn to the case file after the tutorial", () => {
    const visit = visitForSearch(LEARN, doneStore());
    expect(visit.kind).toBe("learn");
  });

  it("still forces the pinned tutorial on unseen visitors", () => {
    const visit = visitForSearch(LEARN, memoryStore());
    expect(visit.kind).toBe("play");
    if (visit.kind === "play") {
      expect(visit.session.input).toEqual(TUTORIAL_INPUT);
    }
  });
});

describe("renderLearn", () => {
  it("pins the case-file sentences and stays in postmortem tone", () => {
    const html = renderLearn(learnWalkStart());
    expect(html).toContain("Learn is a case file. It is not a fourth dungeon.");
    expect(html).toContain("The suite does not mark for you.");
    expect(html).toContain("One first-bad. The failure persists in every descendant.");
    expect(html).toContain("This walk marks what the suite said. The real case will not.");
    expect(html.toLowerCase()).not.toMatch(/goblin|lurk|attack|xp|loot/);
  });

  it("names all eight mutations as hand copy", () => {
    const html = renderLearn(learnWalkStart());
    for (const name of [
      "offByOneLoopBound",
      "flippedBoolean",
      "regexMissingEscape",
      "wrongFixtureValue",
      "brokenComparison",
      "missingReturn",
      "invertedSortComparator",
      "sliceFencepost",
    ]) {
      expect(html).toContain(name);
    }
  });

  it("marks the learn door current and offers the play doors", () => {
    const html = renderLearn(learnWalkStart());
    expect(html).toContain("href=\"?l=learn\" aria-current=\"page\">Learn</a>");
    expect(html).toContain("?l=tutorial");
    expect(html).toContain("?l=yesterday");
  });

  it("shows the win exhibit only after the walk accuses", () => {
    const start = learnWalkStart();
    expect(renderLearn(start)).not.toContain("class=\"exhibit\"");
    const won = walkToEnd(start);
    expect(won.outcome).toBe("won");
    const html = renderLearn(won);
    expect(html).toContain("class=\"exhibit\"");
    expect(html).toContain("src/collect.ts");
  });
});

describe("learn exhibits", () => {
  it("freezes four hallways and keeps every room sha", () => {
    const exhibits = learnExhibits();
    expect(exhibits.map((exhibit) => exhibit.id)).toEqual([
      "tutorial-start",
      "after-one-mark",
      "yesterday-start",
      "lost-walk",
    ]);
    for (const exhibit of exhibits) {
      expect(exhibit.svg.startsWith("<svg")).toBe(true);
      expect(exhibit.svg).toContain("data-sha=");
    }
  });

  it("ends the dishonest walk in a filed loss without naming the first-bad", () => {
    const lost = learnExhibits().find((exhibit) => exhibit.id === "lost-walk");
    if (lost === undefined) {
      throw new Error("missing lost-walk exhibit");
    }
    expect(lost.caption).toContain("That SHA was not the first-bad.");
    const firstBad = learnWalkStart().generated.firstBad;
    expect(lost.caption).not.toContain(firstBad.slice(0, 7));
  });
});

describe("honest walk", () => {
  it("starts at zero marks on the pinned tutorial", () => {
    const walk = learnWalkStart();
    expect(walk.input).toEqual(TUTORIAL_INPUT);
    expect(walk.marks).toBe(0);
    expect(walk.outcome).toBe("playing");
  });

  it("wins at optimal by marking what the suite said", () => {
    const won = walkToEnd(learnWalkStart());
    expect(won.outcome).toBe("won");
    expect(won.bisect.accused).toBe(won.generated.firstBad);
    expect(won.marks).toBe(optimalMarks(8));
    expect(learnWalkNext(won)).toBe(won);
  });
});

describe("learn door in the other desks", () => {
  it("appears on the play desk once the tutorial is done", () => {
    const visit = visitForSearch("?l=yesterday", doneStore());
    if (visit.kind !== "play") {
      throw new Error("expected a play visit");
    }
    const html = renderChrome(visit.session, { tutorialDone: true });
    expect(html).toContain("?l=learn");
  });

  it("appears on the invalid-share desk", () => {
    let caught: GameError | null = null;
    try {
      parseUrl("?l=seeded&n=31&seed=1729");
    } catch (error) {
      if (error instanceof GameError) {
        caught = error;
      }
    }
    if (caught === null) {
      throw new Error("expected INVALID_URL");
    }
    const html = renderBadUrl(caught, { tutorialDone: true });
    expect(html).toContain("?l=learn");
  });
});
