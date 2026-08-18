import { describe, expect, it } from "vitest";

import type { GenerateInput } from "../src/core/types";
import { createSession, dispatch } from "../src/harness";
import { buildViewModel } from "../src/render";

const TUTORIAL: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

const RENDER_SOURCES = import.meta.glob("../src/render/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("buildViewModel", () => {
  it("emits shape + label rooms for the tutorial dungeon", () => {
    const session = createSession(TUTORIAL);
    const vm = buildViewModel(session);
    expect(vm.nodes).toHaveLength(9);
    expect(vm.edges).toHaveLength(8);
    expect(vm.head).toBe(session.bisect.current);
    expect(vm.range).toEqual({
      lo: session.bisect.knownGood,
      hi: session.bisect.knownBad,
    });
    expect(vm.lastResult).toEqual(session.lastResult);

    const oldest = vm.nodes[0];
    const midpoint = vm.nodes[4];
    const interior = vm.nodes[2];
    const newest = vm.nodes[8];
    if (
      oldest === undefined ||
      midpoint === undefined ||
      interior === undefined ||
      newest === undefined
    ) {
      throw new Error("tutorial view-model missing expected rooms");
    }
    expect(oldest).toMatchObject({ shape: "lamp", label: "lamp", lit: false });
    expect(midpoint).toMatchObject({ shape: "lantern", label: "HEAD", lit: true });
    expect(midpoint.sha).toBe(session.bisect.current);
    expect(interior).toMatchObject({ shape: "fog", label: "fog", lit: true });
    expect(newest).toMatchObject({ shape: "rot", label: "rot", lit: true });
    expect(newest.sha).toBe(session.bisect.knownBad);
    expect(vm.edges).toHaveLength(8);
    expect(vm.edges[0]).toEqual({ from: oldest.sha, to: vm.nodes[1]?.sha });
    expect(vm.colors).toEqual({
      good: "amber",
      bad: "magenta",
      unknown: "slate",
      head: "amber-rim",
      range: "warm-wash",
    });
  });

  it("keeps knowledge shapes and unlights rooms past the new hi after a bad mark", () => {
    const started = createSession(TUTORIAL);
    expect(started.lastResult.ok).toBe(false);
    const marked = dispatch(started, "bad");
    const vm = buildViewModel(marked);
    const oldMid = started.bisect.current;
    const oldMidNode = vm.nodes.find((node) => node.sha === oldMid);
    const current = vm.nodes.find((node) => node.sha === marked.bisect.current);
    if (oldMidNode === undefined || current === undefined) {
      throw new Error("expected current and former midpoint rooms");
    }
    expect(current).toMatchObject({ shape: "lantern", label: "HEAD", lit: true });
    expect(oldMidNode).toMatchObject({ shape: "rot", label: "rot", lit: true });
    const hi = vm.nodes.findIndex((node) => node.sha === marked.bisect.knownBad);
    expect(hi).toBeGreaterThanOrEqual(0);
    for (let i = hi + 1; i < vm.nodes.length; i += 1) {
      const node = vm.nodes[i];
      if (node === undefined) {
        throw new Error(`missing node at ${String(i)}`);
      }
      expect(node.lit, node.sha).toBe(false);
      expect(node.shape).toBe("rot");
    }
  });
});

describe("src/render imports", () => {
  it("does not import bugs or the suite", () => {
    const files = Object.entries(RENDER_SOURCES);
    expect(files.length).toBeGreaterThan(0);
    for (const [file, text] of files) {
      if (typeof text !== "string") {
        throw new Error(`expected raw source for ${file}`);
      }
      const imports = text.match(/^import .+$/gm) ?? [];
      for (const line of imports) {
        expect(line, file).not.toMatch(/bugs/);
        expect(line, file).not.toMatch(/suite/);
        expect(line, file).not.toMatch(/from ["']\.\.\/core["']/);
      }
    }
  });
});
