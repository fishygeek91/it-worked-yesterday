import { describe, expect, it } from "vitest";

import { checkout, createLinearHistory, GameError, goodTree, log } from "../src/core";

describe("fake git", () => {
  it("builds a linear history with unique SHAs and checkout + log", () => {
    const repo = createLinearHistory([
      { message: "root", tree: goodTree("a") },
      { message: "mid", tree: goodTree("b") },
      { message: "head", tree: goodTree("c") },
    ]);
    expect(new Set(repo.order).size).toBe(3);
    expect(repo.head).toBe(repo.order[2]);
    const newestFirst = log(repo);
    expect(newestFirst.map((commit) => commit.message)).toEqual(["head", "mid", "root"]);
    const mid = repo.order[1];
    if (mid === undefined) {
      throw new Error("expected mid sha");
    }
    const moved = checkout(repo, mid);
    expect(moved.head).toBe(mid);
    expect(log(moved)[0]?.message).toBe("mid");
  });

  it("is deterministic for the same specs", () => {
    const specs = [
      { message: "root", tree: goodTree("a") },
      { message: "head", tree: goodTree("b") },
    ] as const;
    const left = createLinearHistory(specs);
    const right = createLinearHistory(specs);
    expect(left.order).toEqual(right.order);
  });

  it("rejects checkout of an unknown sha", () => {
    const repo = createLinearHistory([{ message: "root", tree: goodTree("a") }]);
    expect(() => {
      checkout(repo, "0".repeat(40));
    }).toThrow(GameError);
  });

  it("rejects an empty history", () => {
    expect(() => {
      createLinearHistory([]);
    }).toThrow(GameError);
  });
});
