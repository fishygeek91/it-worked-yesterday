import { describe, expect, it } from "vitest";

import { GameError, mulberry32 } from "../src/core";

describe("mulberry32", () => {
  it("replays the same stream for the same seed", () => {
    const a = mulberry32(1729);
    const b = mulberry32(1729);
    const left = Array.from({ length: 20 }, () => a.next());
    const right = Array.from({ length: 20 }, () => b.next());
    expect(left).toEqual(right);
  });

  it("diverges for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("nextInt stays in range", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 40; i += 1) {
      const n = rng.nextInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it("rejects a non-uint32 seed", () => {
    expect(() => {
      mulberry32(-1);
    }).toThrow(GameError);
    expect(() => {
      mulberry32(1.5);
    }).toThrow(GameError);
  });
});
