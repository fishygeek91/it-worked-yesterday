import { describe, expect, it } from "vitest";

import { GameError, optimalMarks } from "../src/core";
import {
  createSession,
  dispatch,
  FRIDAY_INPUT,
  HOTFIX_INPUT,
  parseUrl,
  sessionFromUrl,
  shareUrl,
  type GameSession,
} from "../src/harness";
import { renderChrome } from "../src/ui";

/**
 * Mark what the suite said until one commit remains, then accuse.
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

describe("the Friday deploy", () => {
  it("parses ?l=friday, ignores n and seed, and stays case-sensitive", () => {
    expect(parseUrl("?l=friday")).toEqual({ level: "friday", marks: 0 });
    expect(parseUrl("?l=friday&n=32&seed=7")).toEqual({ level: "friday", marks: 0 });
    expect(() => parseUrl("?l=Friday")).toThrow(GameError);
  });

  it("plants the pinned linear n=64 dungeon and is winnable", () => {
    const session = sessionFromUrl("?l=friday");
    expect(session.bisect.suspectCount).toBe(64);
    expect(optimalMarks(session.bisect.suspectCount)).toBe(6);
    const won = honestWin(session);
    expect(won.outcome).toBe("won");
    expect(won.bisect.accused).toBe(won.generated.firstBad);
  });

  it("shares its own level id, not seeded", () => {
    const session = createSession(FRIDAY_INPUT);
    expect(shareUrl(session)).toBe("?l=friday&marks=0");
    const marked = dispatch(session, session.lastResult.ok ? "good" : "bad");
    expect(shareUrl(marked).startsWith("?l=friday&t=")).toBe(true);
  });

  it("names the case, opens its door, and keeps the tone", () => {
    const html = renderChrome(createSession(FRIDAY_INPUT), { tutorialDone: true });
    expect(html).toContain("The Friday deploy");
    expect(html).toContain("href=\"?l=friday\" aria-current=\"page\"");
    expect(html).toContain("It shipped on a Friday.");
    expect(html.toLowerCase()).not.toMatch(/goblin|lurk|attack|xp|loot/);
  });
});

describe("the hotfix", () => {
  it("parses ?l=hotfix, ignores n and seed, and stays case-sensitive", () => {
    expect(parseUrl("?l=hotfix")).toEqual({ level: "hotfix", marks: 0 });
    expect(parseUrl("?l=hotfix&n=64&seed=9")).toEqual({ level: "hotfix", marks: 0 });
    expect(() => parseUrl("?l=Hotfix")).toThrow(GameError);
  });

  it("plants the pinned n=16 trunk-lane diamond and is winnable", () => {
    const session = sessionFromUrl("?l=hotfix");
    expect(session.bisect.suspectCount).toBe(16);
    // The diamond has one fork and one join: some room has two parents.
    const merges = session.bisect.repo.order.filter(
      (sha) => session.bisect.repo.commits[sha]?.parents.length === 2,
    );
    expect(merges).toHaveLength(1);
    const won = honestWin(session);
    expect(won.outcome).toBe("won");
    expect(won.bisect.accused).toBe(won.generated.firstBad);
  });

  it("shares its own level id and resumes through t", () => {
    const session = createSession(HOTFIX_INPUT);
    expect(shareUrl(session)).toBe("?l=hotfix&marks=0");
    const marked = dispatch(session, session.lastResult.ok ? "good" : "bad");
    const query = shareUrl(marked);
    expect(query.startsWith("?l=hotfix&t=")).toBe(true);
    const replayed = sessionFromUrl(query);
    expect(replayed.bisect.suspects).toEqual(marked.bisect.suspects);
    expect(replayed.marks).toBe(marked.marks);
  });

  it("names the case, opens its door, and owns the merge fairness line", () => {
    const html = renderChrome(createSession(HOTFIX_INPUT), { tutorialDone: true });
    expect(html).toContain("The hotfix");
    expect(html).toContain("href=\"?l=hotfix\" aria-current=\"page\"");
    expect(html).toContain("A merge can miss it by a step.");
    expect(html.toLowerCase()).not.toMatch(/goblin|lurk|attack|xp|loot/);
  });
});
