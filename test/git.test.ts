import { describe, expect, it } from "vitest";

import {
  ancestors,
  checkout,
  commitAt,
  contentSha,
  createHistory,
  createLinearHistory,
  descendants,
  GameError,
  goodTree,
  hashCommit,
  log,
  treePayload,
} from "../src/core";

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

  it("keeps linear SHAs on the v1 formula and fills parents", () => {
    const specs = [
      { message: "root", tree: goodTree("a") },
      { message: "mid", tree: goodTree("b") },
      { message: "head", tree: goodTree("c") },
    ] as const;
    const repo = createLinearHistory(specs);
    let parent: string | null = null;
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i];
      if (spec === undefined) {
        throw new Error(`missing spec ${String(i)}`);
      }
      const expected = contentSha([
        parent ?? "root",
        String(i),
        spec.message,
        treePayload(spec.tree),
      ]);
      const sha = repo.order[i];
      expect(sha).toBe(expected);
      if (sha === undefined) {
        throw new Error(`missing sha ${String(i)}`);
      }
      const commit = commitAt(repo, sha);
      expect(commit.parent).toBe(parent);
      expect(commit.parents).toEqual(parent === null ? [] : [parent]);
      parent = sha;
    }
  });

  it("hashes both merge parents in order and rejects octopus", () => {
    const root = { message: "root", tree: goodTree("a"), parentIndices: [] as const };
    const trunk = { message: "trunk", tree: goodTree("b"), parentIndices: [0] as const };
    const branch = { message: "branch", tree: goodTree("c"), parentIndices: [0] as const };
    const merge = {
      message: "merge",
      tree: goodTree("d"),
      parentIndices: [1, 2] as const,
    };
    const repo = createHistory([root, trunk, branch, merge]);
    const mergeSha = repo.order[3];
    if (mergeSha === undefined) {
      throw new Error("missing merge");
    }
    const commit = commitAt(repo, mergeSha);
    expect(commit.parents).toEqual([repo.order[1], repo.order[2]]);
    expect(commit.sha).toBe(hashCommit(commit.parents, 3, commit.message, commit.tree));
    expect(createHistory([root, trunk, branch, merge]).order).toEqual(repo.order);
    expect(() => {
      createHistory([
        root,
        trunk,
        branch,
        { message: "third", tree: goodTree("e"), parentIndices: [0] },
        { message: "octopus", tree: goodTree("f"), parentIndices: [1, 2, 3] },
      ]);
    }).toThrow(GameError);
  });

  it("walks DAG ancestors and descendants in repo.order", () => {
    const repo = createHistory([
      { message: "root", tree: goodTree("a"), parentIndices: [] },
      { message: "trunk", tree: goodTree("b"), parentIndices: [0] },
      { message: "branch", tree: goodTree("c"), parentIndices: [0] },
      { message: "merge", tree: goodTree("d"), parentIndices: [1, 2] },
    ]);
    const root = repo.order[0];
    const trunk = repo.order[1];
    const branch = repo.order[2];
    const mergeSha = repo.order[3];
    if (root === undefined || trunk === undefined || branch === undefined || mergeSha === undefined) {
      throw new Error("expected four commits");
    }
    expect(ancestors(repo, mergeSha)).toEqual([root, trunk, branch, mergeSha]);
    expect(descendants(repo, trunk)).toEqual([trunk, mergeSha]);
    expect(descendants(repo, branch)).toEqual([branch, mergeSha]);
    expect(descendants(repo, root)).toEqual([root, trunk, branch, mergeSha]);
  });
});
