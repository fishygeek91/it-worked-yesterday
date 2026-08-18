import { describe, expect, it } from "vitest";

import { COMMAND_COSTS, costOf, GameError, optimalMarks } from "../src/core";

describe("score table", () => {
  it("exposes one table and costOf reads from it", () => {
    expect(costOf("good")).toBe(COMMAND_COSTS.good);
    expect(costOf("bad")).toBe(COMMAND_COSTS.bad);
    expect(costOf("reset")).toBe(COMMAND_COSTS.reset);
    expect(costOf("accuse")).toBe(COMMAND_COSTS.accuse);
    expect(costOf("blame")).toBe(COMMAND_COSTS.blame);
    expect(costOf("checkout")).toBe(COMMAND_COSTS.checkout);
  });

  it("computes ceil(log2(n))", () => {
    expect(optimalMarks(1)).toBe(0);
    expect(optimalMarks(7)).toBe(3);
    expect(optimalMarks(8)).toBe(3);
    expect(optimalMarks(16)).toBe(4);
    expect(optimalMarks(32)).toBe(5);
    expect(optimalMarks(64)).toBe(6);
  });

  it("rejects an unknown command", () => {
    expect(() => {
      costOf("attack");
    }).toThrow(GameError);
  });
});
