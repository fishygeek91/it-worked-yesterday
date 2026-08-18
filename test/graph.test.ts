import { describe, expect, it } from "vitest";

import type { GenerateInput } from "../src/core/types";
import { createSession, seededInput } from "../src/harness";
import { buildViewModel, GRAPH_PAINT, renderGraph } from "../src/render";

const TUTORIAL: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

const GRAPH_SOURCE = import.meta.glob("../src/render/graph.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("renderGraph", () => {
  it("paints a dark SVG dungeon from the tutorial view-model", () => {
    const session = createSession(TUTORIAL);
    const vm = buildViewModel(session);
    const svg = renderGraph(vm);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(GRAPH_PAINT.background);
    expect(svg).toContain(GRAPH_PAINT.amber);
    expect(svg).toContain(GRAPH_PAINT.magenta);
    expect(svg).toContain(GRAPH_PAINT.slate);
    expect(svg).not.toMatch(/#00ff00|#0f0\b|#ff0000|#f00\b/i);

    expect(vm.nodes).toHaveLength(9);
    for (const node of vm.nodes) {
      expect(svg).toContain(
        `data-shape="${node.shape}" data-label="${node.label}" data-lit="${node.lit ? "true" : "false"}" data-sha="${node.sha}"`,
      );
    }

    const oldest = vm.nodes[0];
    const interior = vm.nodes[2];
    const midpoint = vm.nodes[4];
    const newest = vm.nodes[8];
    if (
      oldest === undefined ||
      interior === undefined ||
      midpoint === undefined ||
      newest === undefined
    ) {
      throw new Error("tutorial view-model missing expected rooms");
    }
    expect(oldest).toMatchObject({ shape: "lamp", label: "lamp", lit: false });
    expect(interior).toMatchObject({ shape: "fog", label: "fog", lit: true });
    expect(midpoint).toMatchObject({ shape: "lantern", label: "HEAD", lit: true });
    expect(newest).toMatchObject({ shape: "rot", label: "rot", lit: true });
  });

  it("keeps every seeded-32 room and compresses the fogged wings", () => {
    const session = createSession(seededInput(32, 1729));
    const vm = buildViewModel(session);
    const svg = renderGraph(vm);
    expect(vm.nodes).toHaveLength(33);
    for (const node of vm.nodes) {
      expect(svg).toContain(
        `data-shape="${node.shape}" data-label="${node.label}" data-lit="${node.lit ? "true" : "false"}" data-sha="${node.sha}"`,
      );
    }
    const box = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) /);
    const width = box === null ? Number.NaN : Number(box[1]);
    const evenWidth = 48 * 2 + 32 * 72;
    expect(width).toBeLessThan(evenWidth);
    expect(width).toBeGreaterThan(48 * 2);
  });
});

describe("src/render/graph.ts imports", () => {
  it("does not import bugs, suite, or the core barrel", () => {
    const files = Object.entries(GRAPH_SOURCE);
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
