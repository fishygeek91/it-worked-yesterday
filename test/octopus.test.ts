import { describe, expect, it } from "vitest";

import {
  ancestors,
  commitAt,
  descendants,
  GameError,
  generateDiamondHistory,
  generateOctopusHistory,
  hashCommit,
  mergeBase,
  octopusLayout,
  runSuite,
  type OctopusGenerateInput,
} from "../src/core";
import {
  createSession,
  dispatch,
  OCTOPUS_INPUT,
  parseUrl,
  sessionFromUrl,
  shareUrl,
  type GameSession,
} from "../src/harness";
import { buildViewModel, renderGraph } from "../src/render";
import { renderChrome } from "../src/ui";
import { requireSha } from "./helpers";

const SMALL_OCTOPUS: OctopusGenerateInput = {
  suspectCount: 11,
  laneCount: 3,
  seed: 1729,
  mutation: "flippedBoolean",
  firstBadLane: 1,
  firstBadOnLane: 1,
};

/**
 * Assert DAG persistence: red exactly on firstBad and its descendants.
 *
 * @param generated - Planted octopus
 */
function assertDagPersistence(generated: ReturnType<typeof generateOctopusHistory>): void {
  const red = new Set(descendants(generated.repo, generated.firstBad));
  for (const sha of generated.repo.order) {
    const ok = runSuite(commitAt(generated.repo, sha).tree).ok;
    expect(ok, sha).toBe(!red.has(sha));
  }
}

/**
 * Mark what the suite said until one commit remains, then accuse.
 *
 * @param session - Starting session
 */
function honestWin(session: GameSession): GameSession {
  let next = session;
  while (next.bisect.status === "searching") {
    next = dispatch(next, next.lastResult.ok ? "good" : "bad");
  }
  return dispatch(next, "accuse");
}

describe("mergeBase", () => {
  it("is the older commit on a line", () => {
    const generated = generateOctopusHistory(SMALL_OCTOPUS);
    const layout = octopusLayout(11, 3);
    const laneZero = layout.laneIndices[0];
    if (laneZero === undefined || laneZero.length < 2) {
      throw new Error("octopus lane zero is too short");
    }
    const older = requireSha(generated.repo, laneZero[0] ?? 0);
    const newer = requireSha(generated.repo, laneZero[laneZero.length - 1] ?? 0);
    expect(mergeBase(generated.repo, [older, newer])).toEqual([older]);
  });

  it("is the fork point on the diamond", () => {
    const diamond = generateDiamondHistory({
      suspectCount: 8,
      seed: 1729,
      mutation: "missingReturn",
      firstBadLane: "branch",
      firstBadOnLane: 1,
    });
    const trunkTip = requireSha(diamond.repo, 3);
    const branchTip = requireSha(diamond.repo, 6);
    expect(mergeBase(diamond.repo, [trunkTip, branchTip])).toEqual([diamond.knownGood]);
  });

  it("is the root across every octopus lane tip", () => {
    const generated = generateOctopusHistory(SMALL_OCTOPUS);
    const layout = octopusLayout(11, 3);
    const tips = layout.laneIndices.map((lane) =>
      requireSha(generated.repo, lane[lane.length - 1] ?? 0),
    );
    expect(mergeBase(generated.repo, tips)).toEqual([generated.knownGood]);
  });

  it("throws on empty input and unknown SHAs", () => {
    const generated = generateOctopusHistory(SMALL_OCTOPUS);
    expect(() => mergeBase(generated.repo, [])).toThrow(GameError);
    expect(() => mergeBase(generated.repo, ["0000000"])).toThrow(GameError);
  });
});

describe("octopus generator", () => {
  it("hashes every parent in order, deterministically", () => {
    const tree = { "src/a.ts": "a" };
    const three = hashCommit(["p1", "p2", "p3"], 4, "join", tree);
    expect(three).toBe(hashCommit(["p1", "p2", "p3"], 4, "join", tree));
    expect(three).not.toBe(hashCommit(["p1", "p3", "p2"], 4, "join", tree));
    expect(hashCommit(["p1", "p2"], 4, "join", tree)).not.toBe(three);
  });

  it("plants exactly one first-bad; other lanes stay green; the join is red", () => {
    const generated = generateOctopusHistory(SMALL_OCTOPUS);
    assertDagPersistence(generated);
    const layout = octopusLayout(11, 3);
    const join = requireSha(generated.repo, layout.mergeIndex);
    expect(runSuite(commitAt(generated.repo, join).tree).ok).toBe(false);
    const laneZero = layout.laneIndices[0];
    const laneTwo = layout.laneIndices[2];
    if (laneZero === undefined || laneTwo === undefined) {
      throw new Error("octopus lanes missing");
    }
    for (const index of [...laneZero, ...laneTwo]) {
      const sha = requireSha(generated.repo, index);
      expect(runSuite(commitAt(generated.repo, sha).tree).ok, sha).toBe(true);
    }
    // The join reaches the first-bad only through the guilty lane.
    expect(ancestors(generated.repo, join)).toContain(generated.firstBad);
  });

  it("asserts the known-good is the merge-base of all lane tips", () => {
    const generated = generateOctopusHistory(OCTOPUS_INPUT);
    expect(generated.knownGood).toBe(requireSha(generated.repo, 0));
  });

  it("rejects fewer than three lanes and lanes without room", () => {
    expect(() => octopusLayout(11, 2)).toThrow(GameError);
    expect(() => octopusLayout(4, 3)).toThrow(GameError);
    expect(() =>
      generateOctopusHistory({ ...SMALL_OCTOPUS, firstBadLane: 3 }),
    ).toThrow(GameError);
    expect(() =>
      generateOctopusHistory({ ...SMALL_OCTOPUS, firstBadOnLane: 9 }),
    ).toThrow(GameError);
  });
});

describe("the release train level", () => {
  it("parses ?l=octopus, ignores n and seed, and stays case-sensitive", () => {
    expect(parseUrl("?l=octopus")).toEqual({ level: "octopus", marks: 0 });
    expect(parseUrl("?l=octopus&n=64&seed=42")).toEqual({ level: "octopus", marks: 0 });
    expect(() => parseUrl("?l=Octopus")).toThrow(GameError);
  });

  it("shares its own level id and resumes through t", () => {
    const session = createSession(OCTOPUS_INPUT);
    expect(shareUrl(session)).toBe("?l=octopus&marks=0");
    const marked = dispatch(session, session.lastResult.ok ? "good" : "bad");
    const query = shareUrl(marked);
    expect(query.startsWith("?l=octopus&t=")).toBe(true);
    const replayed = sessionFromUrl(query);
    expect(replayed.bisect.suspects).toEqual(marked.bisect.suspects);
    expect(replayed.marks).toBe(marked.marks);
  });

  it("is winnable by marking what the suite said", () => {
    const won = honestWin(createSession(OCTOPUS_INPUT));
    expect(won.outcome).toBe("won");
    expect(won.bisect.accused).toBe(won.generated.firstBad);
  });

  it("names the case and opens its door in the cabinet", () => {
    const session = createSession(OCTOPUS_INPUT);
    const html = renderChrome(session, { tutorialDone: true });
    expect(html).toContain("The release train");
    expect(html).toContain("href=\"?l=octopus\" aria-current=\"page\"");
    expect(html).toContain("Three branches merged in one commit.");
    expect(html.toLowerCase()).not.toMatch(/goblin|lurk|attack|xp|loot/);
  });
});

describe("octopus renderer", () => {
  it("draws one row per lane and keeps every data-sha", () => {
    const session = createSession(OCTOPUS_INPUT);
    const vm = buildViewModel(session);
    const svg = renderGraph(vm);
    for (const node of vm.nodes) {
      expect(svg).toContain(
        `data-shape="${node.shape}" data-label="${node.label}" data-lit="${node.lit ? "true" : "false"}" data-sha="${node.sha}"`,
      );
    }
    // Three lanes: the spine row plus two branch rows, then the foot.
    expect(svg).toMatch(/viewBox="0 0 \d+ 280"/);
    expect(svg).toContain(",138");
    expect(svg).toContain(",198");
    // The join has one corridor per lane tip.
    const merge = vm.edges.filter(
      (edge) => vm.edges.filter((other) => other.to === edge.to).length === 3,
    );
    expect(merge.length).toBe(3);
  });

  it("keeps the diamond on the v2.0 two-lane viewBox", () => {
    const diamond = generateDiamondHistory({
      suspectCount: 8,
      seed: 1729,
      mutation: "missingReturn",
      firstBadLane: "branch",
      firstBadOnLane: 1,
    });
    const session = createSession({
      suspectCount: 8,
      seed: 1729,
      mutation: "missingReturn",
      firstBadLane: "branch",
      firstBadOnLane: 1,
    });
    expect(session.generated.knownGood).toBe(diamond.knownGood);
    const svg = renderGraph(buildViewModel(session));
    expect(svg).toMatch(/viewBox="0 0 \d+ 220"/);
  });
});
