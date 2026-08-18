import { describe, expect, it } from "vitest";

import type { GenerateInput } from "../src/core";
import { createSession, dispatch, type GameSession } from "../src/harness";
import { CUE_SPECS, cueForCommand, renderChrome, renderSoundLatch } from "../src/ui";

const TUTORIAL: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

/**
 * Mark what the suite said until one commit remains, then accuse.
 *
 * @param session - Starting session
 * @param honest - Mark with the suite (win) or against it (lose)
 */
function finish(session: GameSession, honest: boolean): GameSession {
  let next = session;
  while (next.bisect.status === "searching") {
    const suiteSaysGood = next.lastResult.ok;
    next = dispatch(next, suiteSaysGood === honest ? "good" : "bad");
  }
  return dispatch(next, "accuse");
}

describe("sound cues", () => {
  it("synthesizes every cue from data — no asset files", () => {
    for (const cue of ["good", "bad", "win", "lose", "reset"] as const) {
      const specs = CUE_SPECS[cue];
      expect(specs.length).toBeGreaterThan(0);
      for (const spec of specs) {
        expect(spec.frequency).toBeGreaterThan(0);
        expect(spec.durationMs).toBeGreaterThan(0);
      }
    }
  });

  it("maps marks and reset to their cues and accuse to the outcome", () => {
    const session = createSession(TUTORIAL);
    expect(cueForCommand("good", session)).toBe("good");
    expect(cueForCommand("bad", session)).toBe("bad");
    expect(cueForCommand("reset", session)).toBe("reset");
    const won = finish(createSession(TUTORIAL), true);
    expect(cueForCommand("accuse", won)).toBe("win");
    const lost = finish(createSession(TUTORIAL), false);
    expect(cueForCommand("accuse", lost)).toBe("lose");
  });

  it("keeps looks silent: blame and checkout have no cue", () => {
    const session = createSession(TUTORIAL);
    expect(cueForCommand("blame", session)).toBeNull();
    expect(cueForCommand(`checkout ${session.generated.knownGood}`, session)).toBeNull();
  });
});

describe("the sound latch", () => {
  it("renders muted by default and carries state in aria-pressed", () => {
    expect(renderSoundLatch(false)).toContain("aria-pressed=\"false\"");
    expect(renderSoundLatch(false)).toContain("sound: off");
    expect(renderSoundLatch(true)).toContain("aria-pressed=\"true\"");
    expect(renderSoundLatch(true)).toContain("sound: on");
  });

  it("is not a command: no data-command, no cost, in the chrome", () => {
    const session = createSession(TUTORIAL);
    const html = renderChrome(session, { tutorialDone: true });
    expect(html).toContain("data-sound");
    expect(html).toContain("sound: off");
    const latch = html.match(/<button[^>]*data-sound[^>]*>/);
    if (latch === null) {
      throw new Error("latch button missing");
    }
    expect(latch[0]).not.toContain("data-command");
    expect(latch[0]).not.toContain("data-cost");
    const on = renderChrome(session, { tutorialDone: true, soundOn: true });
    expect(on).toContain("sound: on");
  });
});
