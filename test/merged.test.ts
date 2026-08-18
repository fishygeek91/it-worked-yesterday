import { describe, expect, it } from "vitest";

import { diamondLayout, optimalMarks } from "../src/core";
import {
  createSession,
  dispatch,
  isMergedInput,
  markTutorialDone,
  MERGED_INPUT,
  sessionForVisit,
  sessionFromUrl,
  type GameSession,
  type TutorialStore,
} from "../src/harness";
import { renderChrome, renderWinCard, renderWinCardSvg, shareQuery } from "../src/ui";

/**
 * In-memory store. Tests must not touch window.
 */
function memoryStore(): TutorialStore {
  const data = new Map<string, string>();
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
 * Mark what the suite said, then accuse.
 *
 * @param session - Starting session
 */
function playToWin(session: GameSession): GameSession {
  let next = session;
  while (next.bisect.status === "searching") {
    next = dispatch(next, next.lastResult.ok ? "good" : "bad");
  }
  return dispatch(next, "accuse");
}

describe("merged level", () => {
  it("plants the pinned diamond and ignores n and seed", () => {
    const session = sessionFromUrl("?l=merged&n=64&seed=99");
    expect(isMergedInput(session.input)).toBe(true);
    expect(session.input).toEqual(MERGED_INPUT);
    expect(session.input.suspectCount).toBe(32);
    expect(session.input.mutation).toBe("missingReturn");
    expect(session.input).toMatchObject({ firstBadLane: "branch" });
    const layout = diamondLayout(32);
    expect(session.generated.repo.order).toHaveLength(33);
    const merge = session.generated.repo.order[layout.mergeIndex];
    const firstBad = session.generated.firstBad;
    expect(merge).not.toBe(firstBad);
    expect(layout.branchIndices).toContain(
      session.generated.repo.order.indexOf(firstBad),
    );
  });

  it("lets a finished visitor in and keeps unseen players on the tutorial", () => {
    expect(isMergedInput(sessionForVisit("?l=merged", memoryStore()).input)).toBe(false);
    const done = memoryStore();
    markTutorialDone(done);
    expect(isMergedInput(sessionForVisit("?l=merged", done).input)).toBe(true);
  });

  it("wins with a 1200×630 card and a marks share link", () => {
    const won = playToWin(createSession(MERGED_INPUT));
    expect(won.outcome).toBe("won");
    const accused = won.bisect.accused;
    if (accused === null) {
      throw new Error("merged win did not name a SHA");
    }
    const html = renderChrome(won, { tutorialDone: true });
    expect(html).toContain("The feature branch");
    expect(html).toContain("?l=merged");
    expect(html).toContain("data-share-result");
    expect(html).toContain("data-save-card");
    expect(html.toLowerCase()).not.toMatch(/\bgoblin\b|\blurk\b|\battack\b|\bxp\b/);

    const card = renderWinCard(won);
    expect(card).toContain("width:1200px");
    expect(card).toContain("height:630px");
    expect(card).toContain(accused);

    const svg = renderWinCardSvg(won);
    expect(svg).toContain("width=\"1200\"");
    expect(svg).toContain("height=\"630\"");
    expect(svg).toContain(accused);
    for (const sha of won.bisect.repo.order) {
      expect(svg).toContain(`data-sha="${sha}"`);
    }
    expect(shareQuery(won)).toBe(`?l=merged&marks=${String(won.marks)}`);
    expect(shareQuery(won)).not.toContain(accused);
    expect(won.marks).toBeGreaterThanOrEqual(1);
    expect(optimalMarks(32)).toBe(5);
  });
});
