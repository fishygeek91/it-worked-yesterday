import type { ViewModel, ViewNode } from "./viewModel";

/**
 * Token paints. Amber / magenta / slate — not green-vs-red.
 */
export const GRAPH_PAINT = {
  amber: "#e8b86d",
  magenta: "#d65a9a",
  slate: "#7d8a99",
  "amber-rim": "#f3d48a",
  "warm-wash": "#2c2418",
  background: "#12110f",
} as const;

const PAD_X = 48;
const STEP = 72;
const TIGHT = 22;
const EVEN_LAYOUT_MAX = 17;
const ROOM_Y = 78;
const BRANCH_Y = 138;
const LANE_STEP = 60;
const HEIGHT = 168;
const LANE_FOOT = 82;

type Point = {
  x: number;
  y: number;
};

/**
 * Map a view-model color token to paint.
 *
 * @param token - Token from `vm.colors`
 */
function paintFor(token: string): string {
  if (token === "amber") {
    return GRAPH_PAINT.amber;
  }
  if (token === "magenta") {
    return GRAPH_PAINT.magenta;
  }
  if (token === "slate") {
    return GRAPH_PAINT.slate;
  }
  if (token === "amber-rim") {
    return GRAPH_PAINT["amber-rim"];
  }
  if (token === "warm-wash") {
    return GRAPH_PAINT["warm-wash"];
  }
  return GRAPH_PAINT.slate;
}

/**
 * Escape text for SVG attributes and titles.
 *
 * @param value - Raw text
 */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Room geometry. Shape carries the signal; fill is extra.
 *
 * @param node - View-model room
 * @param at - Center
 * @param fill - Token paint
 * @param rim - HEAD stroke
 */
function roomGeometry(node: ViewNode, at: Point, fill: string, rim: string): string {
  const { x, y } = at;
  if (node.shape === "lamp") {
    return [
      `<circle cx="${String(x)}" cy="${String(y)}" r="13" fill="${fill}" />`,
      `<circle cx="${String(x)}" cy="${String(y)}" r="6" fill="${GRAPH_PAINT.background}" fill-opacity="0.35" />`,
      `<line x1="${String(x)}" y1="${String(y - 13)}" x2="${String(x)}" y2="${String(y - 22)}" stroke="${fill}" stroke-width="2.5" stroke-linecap="round" />`,
    ].join("");
  }
  if (node.shape === "rot") {
    const s = 11;
    return [
      `<rect x="${String(x - s)}" y="${String(y - s)}" width="${String(s * 2)}" height="${String(s * 2)}" fill="none" stroke="${fill}" stroke-width="2.5" />`,
      `<line x1="${String(x - s + 3)}" y1="${String(y - s + 3)}" x2="${String(x + s - 3)}" y2="${String(y + s - 3)}" stroke="${fill}" stroke-width="2" />`,
    ].join("");
  }
  if (node.shape === "fog") {
    const points = `${String(x)},${String(y - 14)} ${String(x + 14)},${String(y)} ${String(x)},${String(y + 14)} ${String(x - 14)},${String(y)}`;
    return `<polygon points="${points}" fill="${fill}" fill-opacity="0.18" stroke="${fill}" stroke-dasharray="4 3" stroke-width="1.75" />`;
  }
  return [
    `<circle cx="${String(x)}" cy="${String(y)}" r="16" fill="none" stroke="${rim}" stroke-width="2.5" class="lantern-rim" />`,
    `<circle cx="${String(x)}" cy="${String(y)}" r="8" fill="${rim}" fill-opacity="0.35" />`,
    `<path d="M ${String(x - 7)} ${String(y - 16)} Q ${String(x)} ${String(y - 28)} ${String(x + 7)} ${String(y - 16)}" fill="none" stroke="${rim}" stroke-width="2.5" stroke-linecap="round" />`,
  ].join("");
}

/**
 * Horizontal x for each room. Long halls tighten fogged wings so the
 * remaining range still reads as a walkable hallway.
 *
 * @param count - Room count
 * @param lit - Parallel lit flags
 */
/**
 * Wide gap for the remaining range. Tutorial and Yesterday keep the v1 step.
 */
function hallStep(count: number): number {
  if (count <= EVEN_LAYOUT_MAX) {
    return STEP;
  }
  if (count <= 33) {
    return 52;
  }
  return 40;
}

function nodeXs(count: number, lit: readonly boolean[]): number[] {
  if (count <= EVEN_LAYOUT_MAX) {
    return Array.from({ length: count }, (_, index) => PAD_X + index * STEP);
  }
  const wide = hallStep(count);
  const xs: number[] = [];
  let x = PAD_X;
  for (let index = 0; index < count; index += 1) {
    xs.push(x);
    if (index === count - 1) {
      break;
    }
    const thisLit = lit[index] === true;
    const nextLit = lit[index + 1] === true;
    x += thisLit || nextLit ? wide : TIGHT;
  }
  return xs;
}

/**
 * One corridor between parent and child.
 *
 * @param from - Parent
 * @param to - Child
 */
function corridor(from: Point, to: Point): string {
  return `<line x1="${String(from.x)}" y1="${String(from.y)}" x2="${String(to.x)}" y2="${String(to.y)}" stroke="${GRAPH_PAINT.slate}" stroke-opacity="0.4" stroke-width="3" stroke-linecap="round" />`;
}

/**
 * True when some room has two parents. Linear halls never take this path,
 * so their SVG stays the v1 layout.
 *
 * @param vm - Renderer input
 */
function hasMerge(vm: ViewModel): boolean {
  const incoming = new Map<string, number>();
  for (const edge of vm.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  for (const count of incoming.values()) {
    if (count >= 2) {
      return true;
    }
  }
  return false;
}

/**
 * First parent of each child. The view-model emits the trunk parent first.
 *
 * @param vm - Renderer input
 */
function firstParents(vm: ViewModel): Map<string, string> {
  const parents = new Map<string, string>();
  for (const edge of vm.edges) {
    if (!parents.has(edge.to)) {
      parents.set(edge.to, edge.from);
    }
  }
  return parents;
}

/**
 * First-parent walk from the history tip back to the root, then reversed
 * so x runs oldest to newest on the trunk row.
 *
 * @param vm - Renderer input
 */
function trunkSpine(vm: ViewModel): string[] {
  const parents = firstParents(vm);
  const tip = vm.nodes[vm.nodes.length - 1];
  if (tip === undefined) {
    return [];
  }
  const path: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = tip.sha;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    path.push(current);
    current = parents.get(current);
  }
  path.reverse();
  return path;
}

/**
 * Steps from `sha` to the root along first parents.
 *
 * @param sha - Room
 * @param parents - First-parent map
 */
function depthFromRoot(sha: string, parents: Map<string, string>): number {
  let depth = 0;
  let current: string | undefined = sha;
  const seen = new Set<string>();
  while (current !== undefined && parents.has(current) && !seen.has(current)) {
    seen.add(current);
    current = parents.get(current);
    depth += 1;
  }
  return depth;
}

/**
 * Room centers. Linear halls keep the single-row v1 layout. A DAG puts
 * the first-parent spine on the main row and every other lane on its own
 * row below — one row for the diamond branch (byte-identical to v2.0),
 * one per lane for the v2.1 octopus.
 *
 * @param vm - Renderer input
 */
function roomPoints(vm: ViewModel): { points: Point[]; height: number } {
  const count = vm.nodes.length;
  const lit = vm.nodes.map((node) => node.lit);
  if (!hasMerge(vm)) {
    const xs = nodeXs(count, lit);
    return {
      points: xs.map((x) => ({ x, y: ROOM_Y })),
      height: HEIGHT,
    };
  }
  const spine = trunkSpine(vm);
  const litBySha = new Map(vm.nodes.map((node) => [node.sha, node.lit]));
  const spineLit = spine.map((sha) => litBySha.get(sha) === true);
  const spineXs = nodeXs(spine.length, spineLit);
  const at = new Map<string, Point>();
  const spineSet = new Set<string>();
  for (let i = 0; i < spine.length; i += 1) {
    const sha = spine[i];
    const x = spineXs[i] ?? PAD_X;
    if (sha !== undefined) {
      at.set(sha, { x, y: ROOM_Y });
      spineSet.add(sha);
    }
  }
  const parents = firstParents(vm);
  // A lane starts where a first-parent chain leaves the spine. Walking
  // vm.nodes in order keeps lane numbering stable for the same dungeon.
  const laneOf = new Map<string, number>();
  let laneCount = 0;
  let maxY = BRANCH_Y;
  for (const node of vm.nodes) {
    if (at.has(node.sha)) {
      continue;
    }
    const parent = parents.get(node.sha);
    const parentLane = parent === undefined ? undefined : laneOf.get(parent);
    const laneIndex =
      parent !== undefined && !spineSet.has(parent) && parentLane !== undefined
        ? parentLane
        : laneCount++;
    laneOf.set(node.sha, laneIndex);
    const depth = depthFromRoot(node.sha, parents);
    const spineSha = spine[depth];
    const spineAt = spineSha === undefined ? undefined : at.get(spineSha);
    const y = BRANCH_Y + LANE_STEP * laneIndex;
    maxY = Math.max(maxY, y);
    at.set(node.sha, { x: spineAt === undefined ? PAD_X : spineAt.x, y });
  }
  const points = vm.nodes.map((node) => {
    const found = at.get(node.sha);
    return found === undefined ? { x: PAD_X, y: ROOM_Y } : found;
  });
  return { points, height: maxY + LANE_FOOT };
}

/**
 * Warm wash behind the lit wing. Missing when nothing is lit.
 *
 * @param points - Room centers in order
 * @param lit - Parallel lit flags
 * @param wash - Range paint
 * @param band - Vertical band; omit on linear halls so the rect stays v1
 */
function rangeWash(
  points: Point[],
  lit: boolean[],
  wash: string,
  band?: { y: number; height: number },
): string {
  let first = -1;
  let last = -1;
  for (let i = 0; i < lit.length; i += 1) {
    if (lit[i] === true) {
      if (first < 0) {
        first = i;
      }
      last = i;
    }
  }
  if (first < 0) {
    return "";
  }
  const start = points[first];
  const end = points[last];
  if (start === undefined || end === undefined) {
    return "";
  }
  const x = start.x - 26;
  const w = end.x - start.x + 52;
  const y = band === undefined ? ROOM_Y - 36 : band.y;
  const height = band === undefined ? 72 : band.height;
  return `<rect x="${String(x)}" y="${String(y)}" width="${String(w)}" height="${String(height)}" rx="24" fill="${wash}" />`;
}

/**
 * Render the dungeon map as SVG. Consumes the view-model only.
 *
 * @param vm - Renderer input
 */
export function renderGraph(vm: ViewModel): string {
  const count = vm.nodes.length;
  const { points, height } = roomPoints(vm);
  const lastPoint = points[points.length - 1];
  const lastX = lastPoint === undefined ? PAD_X : lastPoint.x;
  const width = Math.max(PAD_X * 2, lastX + PAD_X);
  const good = paintFor(vm.colors.good);
  const bad = paintFor(vm.colors.bad);
  const unknown = paintFor(vm.colors.unknown);
  const rim = paintFor(vm.colors.head);
  const wash = paintFor(vm.colors.range);
  const bySha = new Map<string, Point>();
  for (let i = 0; i < count; i += 1) {
    const node = vm.nodes[i];
    const at = points[i];
    if (node !== undefined && at !== undefined) {
      bySha.set(node.sha, at);
    }
  }
  const lowestRow = points.reduce((low, at) => Math.max(low, at.y), ROOM_Y);
  const washRect = rangeWash(
    points,
    vm.nodes.map((node) => node.lit),
    wash,
    hasMerge(vm) ? { y: ROOM_Y - 36, height: lowestRow - ROOM_Y + 72 } : undefined,
  );
  const edges = vm.edges
    .map((edge) => {
      const from = bySha.get(edge.from);
      const to = bySha.get(edge.to);
      if (from === undefined || to === undefined) {
        return "";
      }
      return corridor(from, to);
    })
    .join("");
  const rooms = vm.nodes
    .map((node, i) => {
      const at = points[i];
      if (at === undefined) {
        return "";
      }
      const fill =
        node.shape === "lamp" ? good : node.shape === "rot" ? bad : node.shape === "fog" ? unknown : rim;
      const opacity = node.lit ? "1" : "0.32";
      const short = node.sha.slice(0, 7);
      const showLabel = node.lit || i === 0 || i === count - 1 || node.shape === "lantern";
      const labelText = showLabel
        ? `<text x="${String(at.x)}" y="${String(at.y + 34)}" text-anchor="middle" fill="#e8e2d6" font-size="11" font-family="IBM Plex Mono, ui-monospace, monospace">${escapeXml(node.label)}</text>`
        : "";
      const shaText =
        node.shape === "lantern"
          ? `<text x="${String(at.x)}" y="${String(at.y + 50)}" text-anchor="middle" fill="#b7b1a4" font-size="9" font-family="IBM Plex Mono, ui-monospace, monospace">${escapeXml(short)}</text>`
          : "";
      return [
        `<g data-shape="${escapeXml(node.shape)}" data-label="${escapeXml(node.label)}" data-lit="${node.lit ? "true" : "false"}" data-sha="${escapeXml(node.sha)}" opacity="${opacity}">`,
        `<title>${escapeXml(node.sha)} — ${escapeXml(node.message)}</title>`,
        roomGeometry(node, at, fill, rim),
        labelText,
        shaText,
        "</g>",
      ].join("");
    })
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="commit graph">`,
    `<rect width="100%" height="100%" fill="${GRAPH_PAINT.background}" />`,
    washRect,
    edges,
    rooms,
    "</svg>",
  ].join("");
}
