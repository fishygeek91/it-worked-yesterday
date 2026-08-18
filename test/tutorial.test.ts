import { describe, expect, it } from "vitest";

import { indexOfSha } from "../src/core/git";
import {
  isTutorialDone,
  markTutorialDone,
  sessionForVisit,
  TUTORIAL_DONE_KEY,
  TUTORIAL_INPUT,
  type TutorialStore,
} from "../src/harness";
import { renderChrome } from "../src/ui";

const SEEDED = "?l=seeded&n=32&seed=1&marks=0";

const TUTORIAL_SOURCE = import.meta.glob("../src/harness/tutorial.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

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

describe("sessionForVisit", () => {
  it("forces the pinned tutorial until it is done", () => {
    const store = memoryStore();
    expect(isTutorialDone(store)).toBe(false);
    const session = sessionForVisit(SEEDED, store);
    expect(session.input).toEqual(TUTORIAL_INPUT);
    if ("firstBadIndex" in session.input) {
      expect(session.input.firstBadIndex).toBe(3);
    }
    expect(session.input.mutation).toBe("offByOneLoopBound");
    expect(indexOfSha(session.generated.repo, session.generated.firstBad)).toBe(4);
    expect(sessionForVisit("?l=merged", store).input).toEqual(TUTORIAL_INPUT);
  });

  it("honors a seeded URL after the tutorial is done", () => {
    const store = memoryStore();
    markTutorialDone(store);
    expect(store.get(TUTORIAL_DONE_KEY)).toBe("1");
    const session = sessionForVisit(SEEDED, store);
    expect(session.input.suspectCount).toBe(32);
    expect(session.input.seed).toBe(1);
    expect(session.input.mutation).not.toBeUndefined();
  });
});

describe("teach copy", () => {
  it("appears on the pinned tutorial and not on a seeded session", () => {
    const unseen = sessionForVisit(SEEDED, memoryStore());
    const tutorialHtml = renderChrome(unseen);
    expect(tutorialHtml).toContain("HEAD is red. The last green is 8 suspects back.");
    expect(tutorialHtml).toContain("Mark the checkout. The range narrows.");
    expect(tutorialHtml).toContain("When one SHA remains, accuse it.");
    expect(tutorialHtml.toLowerCase()).not.toMatch(/goblin|attack|xp/);

    const done = memoryStore();
    markTutorialDone(done);
    const seededHtml = renderChrome(sessionForVisit(SEEDED, done));
    expect(seededHtml).not.toContain("HEAD is red. The last green is 8 suspects back.");
  });
});

describe("src/harness/tutorial.ts imports", () => {
  it("does not import DOM", () => {
    const files = Object.entries(TUTORIAL_SOURCE);
    expect(files.length).toBeGreaterThan(0);
    for (const [file, text] of files) {
      if (typeof text !== "string") {
        throw new Error(`expected raw source for ${file}`);
      }
      const imports = text.match(/^import .+$/gm) ?? [];
      for (const line of imports) {
        expect(line, file).not.toMatch(/\bwindow\b/);
        expect(line, file).not.toMatch(/\bdocument\b/);
        expect(line, file).not.toMatch(/\blocalStorage\b/);
      }
    }
  });
});
