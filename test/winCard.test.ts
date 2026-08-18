import { describe, expect, it } from "vitest";

import { GameError, optimalMarks, type GenerateInput } from "../src/core";
import { createSession, dispatch, type GameSession } from "../src/harness";
import { renderWinCard } from "../src/ui";

const TUTORIAL: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

const WIN_CARD_SOURCE = import.meta.glob("../src/ui/winCard.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

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

describe("renderWinCard", () => {
  it("is a 1200×630 card with SHA, marks, seed, and the guilty room lit", () => {
    const won = playToWin(createSession(TUTORIAL));
    expect(won.outcome).toBe("won");
    const accused = won.bisect.accused;
    if (accused === null) {
      throw new Error("winning accuse did not name a SHA");
    }
    const html = renderWinCard(won);
    expect(html).toContain("id=\"win-card\"");
    expect(html).toContain("width:1200px");
    expect(html).toContain("height:630px");
    expect(html).toContain(accused);
    expect(html).toContain(`${String(won.marks)} / ${String(optimalMarks(8))}`);
    expect(html).toContain("1729");
    expect(html).toContain(`data-shape="lantern" data-label="HEAD" data-lit="true" data-sha="${accused}"`);
  });

  it("throws when the session is still searching", () => {
    const session = createSession(TUTORIAL);
    expect(session.outcome).toBe("playing");
    try {
      renderWinCard(session);
      expect.fail("win card should throw while searching");
    } catch (error) {
      expect(error).toBeInstanceOf(GameError);
      if (error instanceof GameError) {
        expect(error.code).toBe("NOT_READY_TO_ACCUSE");
      }
    }
  });
});

describe("src/ui/winCard.ts imports", () => {
  it("does not import bugs or the suite", () => {
    const files = Object.entries(WIN_CARD_SOURCE);
    expect(files.length).toBeGreaterThan(0);
    for (const [file, text] of files) {
      if (typeof text !== "string") {
        throw new Error(`expected raw source for ${file}`);
      }
      const imports = text.match(/^import .+$/gm) ?? [];
      for (const line of imports) {
        expect(line, file).not.toMatch(/bugs/);
        expect(line, file).not.toMatch(/suite/);
      }
    }
  });
});
