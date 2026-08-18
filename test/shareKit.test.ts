import { describe, expect, it } from "vitest";

import { GameError, optimalMarks, type GenerateInput } from "../src/core";
import { createSession, dispatch, type GameSession } from "../src/harness";
import { renderChrome, renderWinCardSvg, shareQuery, shareText, winCardFileName } from "../src/ui";

const TUTORIAL: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

const SHARE_KIT_SOURCE = import.meta.glob("../src/ui/shareKit.ts", {
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

/**
 * Expect a share-kit call to throw `NOT_READY_TO_ACCUSE` while playing.
 *
 * @param run - Call under test
 */
function expectNotReady(run: () => string): void {
  try {
    run();
    expect.fail("share kit should throw while searching");
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    if (error instanceof GameError) {
      expect(error.code).toBe("NOT_READY_TO_ACCUSE");
    }
  }
}

describe("shareText", () => {
  it("names the case, the clock, and the seed — never the guilty SHA", () => {
    const won = playToWin(createSession(TUTORIAL));
    expect(won.outcome).toBe("won");
    const accused = won.bisect.accused;
    if (accused === null) {
      throw new Error("winning accuse did not name a SHA");
    }
    const text = shareText(won);
    expect(text).toContain("It worked yesterday. Then someone committed.");
    expect(text).toContain("Tutorial");
    expect(text).toContain(`${String(won.marks)} / ${String(optimalMarks(8))}`);
    expect(text).toContain("seed 1729");
    expect(text).not.toContain(accused);
    expect(text).not.toContain(accused.slice(0, 7));
  });

  it("throws while the session is still searching", () => {
    const session = createSession(TUTORIAL);
    expectNotReady(() => shareText(session));
    expectNotReady(() => shareQuery(session));
    expectNotReady(() => winCardFileName(session));
    expectNotReady(() => renderWinCardSvg(session));
  });
});

describe("shareQuery and winCardFileName", () => {
  it("are deterministic for the same win", () => {
    const won = playToWin(createSession(TUTORIAL));
    expect(shareQuery(won)).toBe(`?l=tutorial&marks=${String(won.marks)}`);
    expect(winCardFileName(won)).toBe(
      `iwy-tutorial-seed-1729-${String(won.marks)}-of-${String(optimalMarks(8))}.png`,
    );
    expect(winCardFileName(won)).toBe(winCardFileName(won));
  });
});

describe("renderWinCardSvg", () => {
  it("is a self-contained 1200×630 SVG with the guilty room lit", () => {
    const won = playToWin(createSession(TUTORIAL));
    const accused = won.bisect.accused;
    if (accused === null) {
      throw new Error("winning accuse did not name a SHA");
    }
    const svg = renderWinCardSvg(won);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("width=\"1200\"");
    expect(svg).toContain("height=\"630\"");
    expect(svg).toContain(accused);
    expect(svg).toContain(`${String(won.marks)} / ${String(optimalMarks(8))}`);
    expect(svg).toContain("seed 1729");
    expect(svg).toContain(`data-shape="lantern" data-label="HEAD" data-lit="true" data-sha="${accused}"`);
    // Every room survives the nesting: n suspects + the known-good root.
    for (const sha of won.bisect.repo.order) {
      expect(svg).toContain(`data-sha="${sha}"`);
    }
    // Self-contained: rasterizing must not fetch anything.
    expect(svg).not.toContain("http://www.w3.org/1999/xlink");
    expect(svg).not.toContain("href=");
  });
});

describe("share-kit controls in the chrome", () => {
  it("render only on a win and are not commands", () => {
    const playing = createSession(TUTORIAL);
    const playingHtml = renderChrome(playing, { tutorialDone: true });
    expect(playingHtml).not.toContain("data-share-result");
    expect(playingHtml).not.toContain("data-save-card");

    const won = playToWin(createSession(TUTORIAL));
    const wonHtml = renderChrome(won, { tutorialDone: true });
    expect(wonHtml).toContain("data-share-result");
    expect(wonHtml).toContain("data-save-card");
    // Not commands: they must not carry data-command or a cost.
    expect(wonHtml).not.toContain("data-command=\"share\"");
    expect(wonHtml.match(/data-share-result/g)?.length).toBe(1);
  });
});

describe("src/ui/shareKit.ts imports", () => {
  it("does not import bugs or the suite", () => {
    const files = Object.entries(SHARE_KIT_SOURCE);
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
