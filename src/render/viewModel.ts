import { commitAt, indexOfSha, shaAt } from "../core/git";
import type { Sha, SuiteResult } from "../core/types";
import type { GameSession } from "../harness/session";

/**
 * Room geometry token. Color is not the signal.
 */
export type NodeShape = "lamp" | "rot" | "fog" | "lantern";

/**
 * Room label token. Color is not the signal.
 */
export type NodeLabel = "lamp" | "rot" | "fog" | "HEAD";

/**
 * One commit room on the dungeon map.
 */
export type ViewNode = {
  sha: Sha;
  message: string;
  shape: NodeShape;
  label: NodeLabel;
  lit: boolean;
};

/**
 * Parent-to-child corridor along `repo.order`.
 */
export type ViewEdge = {
  from: Sha;
  to: Sha;
};

/**
 * Palette tokens. Not hex. Not green-vs-red.
 */
export type ViewColors = {
  good: string;
  bad: string;
  unknown: string;
  head: string;
  range: string;
};

/**
 * Renderer input. Built from a session; never from bugs or the suite.
 */
export type ViewModel = {
  nodes: ViewNode[];
  edges: ViewEdge[];
  colors: ViewColors;
  head: Sha;
  range: { lo: Sha; hi: Sha };
  lastResult: SuiteResult | null;
};

/**
 * Color tokens from the design table. The graph renderer maps these to paint.
 */
export const VIEW_COLORS: ViewColors = {
  good: "amber",
  bad: "magenta",
  unknown: "slate",
  head: "amber-rim",
  range: "warm-wash",
};

/**
 * Shape and label for one order index.
 * Why current overrides knowledge: HEAD is a carried lantern on the room.
 *
 * @param index - Order index
 * @param lo - Newest known-good index
 * @param hi - Oldest known-bad index
 * @param isCurrent - This room is the checkout
 */
function nodeTokens(
  index: number,
  lo: number,
  hi: number,
  isCurrent: boolean,
): { shape: NodeShape; label: NodeLabel } {
  if (isCurrent) {
    return { shape: "lantern", label: "HEAD" };
  }
  if (index <= lo) {
    return { shape: "lamp", label: "lamp" };
  }
  if (index >= hi) {
    return { shape: "rot", label: "rot" };
  }
  return { shape: "fog", label: "fog" };
}

/**
 * Build the renderer view-model from a session.
 * Walks `repo.order`. Copies `lastResult`. Does not import the suite.
 *
 * @param session - Current game session
 */
export function buildViewModel(session: GameSession): ViewModel {
  const repo = session.bisect.repo;
  const lo = indexOfSha(repo, session.bisect.knownGood);
  const hi = indexOfSha(repo, session.bisect.knownBad);
  const current = session.bisect.current;
  const nodes: ViewNode[] = [];
  const edges: ViewEdge[] = [];
  for (let i = 0; i < repo.order.length; i += 1) {
    const sha = shaAt(repo, i);
    const commit = commitAt(repo, sha);
    const tokens = nodeTokens(i, lo, hi, sha === current);
    nodes.push({
      sha,
      message: commit.message,
      shape: tokens.shape,
      label: tokens.label,
      lit: i > lo && i <= hi,
    });
    if (i > 0) {
      edges.push({ from: shaAt(repo, i - 1), to: sha });
    }
  }
  return {
    nodes,
    edges,
    colors: VIEW_COLORS,
    head: current,
    range: { lo: session.bisect.knownGood, hi: session.bisect.knownBad },
    lastResult: session.lastResult,
  };
}
