import { describe, expect, it } from "vitest";

import { costOf, optimalMarks, type GenerateInput } from "../src/core";
import { createSession, dispatch, type GameSession } from "../src/harness";
import { renderChrome } from "../src/ui";

const TUTORIAL: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

const UI_SOURCES = import.meta.glob("../src/ui/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

/**
 * Mark until the range is a single commit. The test chooses the verdict.
 *
 * @param session - Starting session
 * @param choose - How the player marks the current room
 */
function markUntilReady(
  session: GameSession,
  choose: (current: GameSession) => "good" | "bad",
): GameSession {
  let next = session;
  while (next.bisect.status === "searching") {
    next = dispatch(next, choose(next));
  }
  return next;
}

describe("renderChrome", () => {
  it("shows marks, seed, room, and fairness in postmortem tone", () => {
    const session = createSession(TUTORIAL);
    const html = renderChrome(session);
    expect(html).toContain(`class="marks">${String(session.marks)} / ${String(optimalMarks(8))}<`);
    expect(html).toContain("seed 1729");
    expect(html).toContain("This checkout is red. Failed: loop-bound.");
    expect(html).toContain("The clock is marks, not wall time. The suite does not mark for you.");
    expect(html.toLowerCase()).not.toMatch(/goblin|lurk|attack|xp|loot/);
    for (const command of ["good", "bad", "reset", "accuse", "blame"] as const) {
      expect(html).toContain(`data-command="${command}" data-cost="${String(costOf(command))}"`);
    }
    expect(html).toMatch(/data-command="good" data-cost="[^"]+">good<\/button>/);
    expect(html).toMatch(/data-command="bad" data-cost="[^"]+">bad<\/button>/);
    expect(html).toMatch(/data-command="accuse" data-cost="[^"]+" disabled>/);
    expect(html).toMatch(/data-command="reset" data-cost="[^"]+">reset<\/button>/);
    expect(html).toMatch(/data-command="blame" data-cost="[^"]+">blame<\/button>/);
  });

  it("shows the blamed path and not the hunk", () => {
    const session = createSession(TUTORIAL);
    const blamed = dispatch(session, "blame");
    const html = renderChrome(blamed);
    expect(html).toContain("Peek: src/collect.ts");
    expect(html).not.toContain("i &lt; xs.length");
  });

  it("shows the commit message and the tiny diff after a win", () => {
    const started = createSession(TUTORIAL);
    const ready = markUntilReady(started, (current) => (current.lastResult.ok ? "good" : "bad"));
    const won = dispatch(ready, "accuse");
    const html = renderChrome(won, { tutorialDone: true });
    expect(html).toContain("adjust the walk bound");
    expect(html).toContain("src/collect.ts");
    expect(html).toContain("i &lt; xs.length");
    expect(html).toContain("i &lt;= xs.length");
    expect(html).toContain("class=\"doors\"");
    expect(html).toContain("?l=yesterday");
    expect(html.toLowerCase()).not.toMatch(/goblin|lurk|attack|xp|loot/);
  });

  it("marks the open case door and notes an over-the-clock walk", () => {
    const started = createSession(TUTORIAL);
    const blamed = dispatch(dispatch(started, "blame"), "blame");
    expect(blamed.marks).toBeGreaterThan(optimalMarks(8));
    const html = renderChrome(blamed, { tutorialDone: true });
    expect(html).toContain("Over the clock.");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("href=\"?l=tutorial\" aria-current=\"page\">Tutorial</a>");
  });

  it("names the accused short SHA on a loss and does not show the hunk", () => {
    const started = createSession(TUTORIAL);
    const ready = markUntilReady(started, (current) => (current.lastResult.ok ? "bad" : "good"));
    const lost = dispatch(ready, "accuse");
    expect(lost.outcome).toBe("lost");
    const accused = lost.bisect.accused;
    if (accused === null) {
      throw new Error("losing accuse did not name a SHA");
    }
    const html = renderChrome(lost, { tutorialDone: true });
    expect(html).toContain(`Accused ${accused.slice(0, 7)}. That SHA was not the first-bad.`);
    expect(html).not.toContain("i &lt; xs.length");
    expect(html).not.toContain(started.generated.firstBad);
  });

  it("enables accuse only when the range is a single commit", () => {
    const started = createSession(TUTORIAL);
    const ready = markUntilReady(started, (current) => (current.lastResult.ok ? "good" : "bad"));
    expect(ready.bisect.status).toBe("readyToAccuse");
    const html = renderChrome(ready);
    expect(html).toMatch(/data-command="accuse" data-cost="[^"]+">accuse<\/button>/);
    expect(html).toMatch(/data-command="good" data-cost="[^"]+" disabled>/);
    expect(html).toMatch(/data-command="bad" data-cost="[^"]+" disabled>/);
    expect(html).toContain("One SHA remains. Accuse it.");
    expect(renderChrome(started)).not.toContain("One SHA remains. Accuse it.");
  });

  it("keeps help open when the visit says so", () => {
    const html = renderChrome(createSession(TUTORIAL), { tutorialDone: true, helpOpen: true });
    expect(html).toContain("<details class=\"help\" open>");
    expect(renderChrome(createSession(TUTORIAL))).toContain("<details class=\"help\">");
  });
});

describe("src/ui imports", () => {
  it("does not import bugs or the suite", () => {
    const files = Object.entries(UI_SOURCES);
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
