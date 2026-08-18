import { describe, expect, it } from "vitest";

import { GameError } from "../src/core";
import { parseUrl } from "../src/harness";
import { renderBadUrl } from "../src/ui";

/**
 * Capture `INVALID_URL` from a share the parser refuses.
 *
 * @param search - Query that must fail
 */
function invalidUrl(search: string): GameError {
  try {
    parseUrl(search);
    throw new Error(`expected INVALID_URL for ${search}`);
  } catch (error) {
    if (error instanceof GameError && error.code === "INVALID_URL") {
      return error;
    }
    throw error;
  }
}

describe("renderBadUrl", () => {
  it("shows the parser line and does not invent a dungeon", () => {
    const error = invalidUrl("?l=seeded&n=31&seed=1729&marks=5");
    const html = renderBadUrl(error, { tutorialDone: true });
    expect(html).toContain("data-phase=\"invalid\"");
    expect(html).toContain("Invalid URL. The share was not coerced.");
    expect(html).toContain(error.message);
    expect(html).toContain("n is 32 or 64");
    expect(html).toContain("?l=yesterday");
    expect(html).not.toContain("id=\"map\"");
    expect(html.toLowerCase()).not.toMatch(/goblin|lurk|attack|xp|loot/);
  });

  it("keeps the tutorial door when the lock is still on", () => {
    const error = invalidUrl("?l=seeded&n=31&seed=1729");
    const html = renderBadUrl(error);
    expect(html).toContain("?l=tutorial");
    expect(html).not.toContain("?l=yesterday");
  });

  it("rejects a non-URL error so the desk cannot swallow other codes", () => {
    const error = new GameError("INVALID_COMMAND", "unknown session command checkout");
    try {
      renderBadUrl(error);
      expect.fail("bad-url desk should reject other codes");
    } catch (caught) {
      expect(caught).toBeInstanceOf(GameError);
      if (caught instanceof GameError) {
        expect(caught.code).toBe("INVALID_COMMAND");
      }
    }
  });
});
