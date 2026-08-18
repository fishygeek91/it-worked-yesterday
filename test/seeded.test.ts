import { describe, expect, it } from "vitest";

import { commitAt, runSuite } from "../src/core";
import {
  markTutorialDone,
  seededInput,
  sessionForVisit,
  sessionFromUrl,
  shareUrl,
  TUTORIAL_INPUT,
  type GameSession,
  type TutorialStore,
} from "../src/harness";
import { renderChrome } from "../src/ui";

const SEEDED_32 = "?l=seeded&n=32&seed=1729&marks=5";
const SEEDED_64 = "?l=seeded&n=64&seed=1&marks=0";

const CORE_SOURCES = import.meta.glob("../src/core/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

const HARNESS_SOURCES = import.meta.glob("../src/harness/**/*.ts", {
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

/**
 * Store after the tutorial has been finished once.
 */
function doneStore(): TutorialStore {
  const store = memoryStore();
  markTutorialDone(store);
  return store;
}

/**
 * Assert two sessions are the same dungeon. Trees and suite results included.
 *
 * @param left - First session
 * @param right - Second session
 */
function expectSameDungeon(left: GameSession, right: GameSession): void {
  expect(left.generated.firstBad).toBe(right.generated.firstBad);
  expect(left.generated.repo.order).toEqual(right.generated.repo.order);
  expect(left.input).toEqual(right.input);
  for (const sha of left.generated.repo.order) {
    const treeA = commitAt(left.generated.repo, sha).tree;
    const treeB = commitAt(right.generated.repo, sha).tree;
    expect(treeA).toEqual(treeB);
    expect(runSuite(treeA)).toEqual(runSuite(treeB));
  }
}

describe("seeded share mode", () => {
  it("rebuilds the same dungeon for n=32 and n=64", () => {
    for (const search of [SEEDED_32, SEEDED_64]) {
      const a = sessionFromUrl(search);
      const b = sessionFromUrl(search);
      const n = a.input.suspectCount;
      expect(n === 32 || n === 64).toBe(true);
      if (n !== 32 && n !== 64) {
        throw new Error("seeded n must be 32 or 64");
      }
      expect(a.input).toEqual(seededInput(n, a.input.seed));
      expect(a.input).not.toEqual(TUTORIAL_INPUT);
      expectSameDungeon(a, b);
    }
  });

  it("round-trips shareUrl without replaying the range", () => {
    const started = sessionFromUrl(SEEDED_32);
    expect(started.marks).toBe(5);
    const shared = shareUrl(started);
    expect(shared).toBe(SEEDED_32);
    const restored = sessionFromUrl(shared);
    expectSameDungeon(started, restored);
    expect(restored.marks).toBe(5);
    expect(restored.bisect.status).toBe("searching");
    expect(restored.bisect.marks).toBe(0);
  });

  it("forces the tutorial until it is done, then plants the seeded URL", () => {
    const unseen = sessionForVisit(SEEDED_32, memoryStore());
    expect(unseen.input).toEqual(TUTORIAL_INPUT);
    const done = sessionForVisit(SEEDED_32, doneStore());
    expect(done.input).toEqual(seededInput(32, 1729));
    expect(done.input.suspectCount).toBe(32);
  });
});

describe("seeded chrome", () => {
  it("shows the share query and not the tutorial teach lines", () => {
    const session = sessionFromUrl(SEEDED_32);
    const html = renderChrome(session);
    expect(html).toContain("class=\"share\"");
    expect(html).toContain("?l=seeded&amp;n=32&amp;seed=1729&amp;marks=5");
    expect(html).not.toContain("HEAD is red. The last green is 8 suspects back.");
    expect(html.toLowerCase()).not.toMatch(/goblin|attack|xp/);
  });
});

describe("seeded path determinism", () => {
  it("does not call Math.random or Date.now in core or harness", () => {
    const files = [...Object.entries(CORE_SOURCES), ...Object.entries(HARNESS_SOURCES)];
    expect(files.length).toBeGreaterThan(0);
    for (const [file, text] of files) {
      if (typeof text !== "string") {
        throw new Error(`expected raw source for ${file}`);
      }
      expect(text, file).not.toMatch(/Math\.random\(/);
      expect(text, file).not.toMatch(/Date\.now\(/);
    }
  });
});
